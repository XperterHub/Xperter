import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function getServiceAccount(): ServiceAccount {
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_GEN_LANG_CLIENT_0104750557;
  if (envKey) {
    try {
      return JSON.parse(envKey);
    } catch {
      throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON');
    }
  }

  // Fallback to local files if present
  const localCandidates = [
    path.resolve('.service-account.json'),
    path.resolve('temp_sa.json')
  ];
  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
  }

  throw new Error('No FIREBASE_SERVICE_ACCOUNT found in environment or local files.');
}

function createJwt(sa: ServiceAccount): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase'
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${b64Header}.${b64Payload}`);
  const signature = signer.sign(sa.private_key, 'base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = createJwt(sa);
  const postData = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  }).toString();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

function getAllFiles(dir: string, baseDir: string = dir): { relativePath: string; fullPath: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { relativePath: string; fullPath: string }[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.push({ relativePath: rel, fullPath });
    }
  }
  return files;
}

async function runConcurrent<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let index = 0;
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const currIndex = index++;
    const p = fn(item, currIndex).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

async function main() {
  const sa = getServiceAccount();
  const siteId = sa.project_id || 'gen-lang-client-0104750557';
  const publicDir = path.resolve('.output/public');

  if (!fs.existsSync(publicDir)) {
    throw new Error(`Directory ${publicDir} does not exist`);
  }

  console.log('1. Authenticating with Firebase...');
  const token = await getAccessToken(sa);

  console.log('2. Creating new Hosting version...');
  const verRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/versions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      config: {
        rewrites: [{ glob: '**', path: '/index.html' }],
        headers: [
          {
            glob: '**/*.@(js|css|svg|png|jpg|jpeg|webp|woff2|woff|ttf|ico)',
            headers: {
              'Cache-Control': 'max-age=31536000, immutable'
            }
          }
        ]
      }
    })
  });
  if (!verRes.ok) throw new Error(`Create version failed: ${await verRes.text()}`);
  const version = await verRes.json();
  const versionName = version.name;
  console.log('   Version created:', versionName);

  console.log('3. Scanning files and computing SHA256 hashes...');
  const files = getAllFiles(publicDir);
  const fileHashMap: Record<string, string> = {};
  const hashToBuffer: Record<string, Buffer> = {};

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath);
    const gz = zlib.gzipSync(content);
    const hash = crypto.createHash('sha256').update(gz).digest('hex');
    fileHashMap[file.relativePath] = hash;
    hashToBuffer[hash] = gz;
  }
  console.log(`   Found ${files.length} files to deploy.`);

  console.log('4. Populating files to Firebase Hosting...');
  const popRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: fileHashMap })
  });
  if (!popRes.ok) throw new Error(`Populate files failed: ${await popRes.text()}`);
  const popData = await popRes.json();
  const uploadRequiredHashes: string[] = popData.uploadRequiredHashes || [];
  const uploadUrl = popData.uploadUrl;
  console.log(`   ${uploadRequiredHashes.length} files need uploading.`);

  if (uploadRequiredHashes.length > 0 && uploadUrl) {
    console.log('5. Uploading files with concurrency...');
    let uploadedCount = 0;
    await runConcurrent(uploadRequiredHashes, 10, async (hash) => {
      const gz = hashToBuffer[hash];
      const upRes = await fetch(`${uploadUrl}/${hash}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream'
        },
        body: gz
      });
      if (!upRes.ok) throw new Error(`Upload hash ${hash} failed: ${await upRes.text()}`);
      uploadedCount++;
      if (uploadedCount % 20 === 0 || uploadedCount === uploadRequiredHashes.length) {
        console.log(`   Uploaded ${uploadedCount}/${uploadRequiredHashes.length} files...`);
      }
    });
    console.log('   All files uploaded successfully.');
  }

  console.log('6. Finalizing version status...');
  const finRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'FINALIZED' })
  });
  if (!finRes.ok) throw new Error(`Finalize failed: ${await finRes.text()}`);

  console.log('7. Releasing version to live channel...');
  const relRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/releases?versionName=${versionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!relRes.ok) throw new Error(`Release failed: ${await relRes.text()}`);
  const release = await relRes.json();
  console.log('   Release live:', release.name);
  console.log('\n🎉 SUCCESS! Site successfully deployed to:');
  console.log('   https://gen-lang-client-0104750557.web.app');
  console.log('   https://gen-lang-client-0104750557.firebaseapp.com\n');
}

main().catch((err) => {
  console.error('Deployment error:', err.message || err);
  process.exit(1);
});
