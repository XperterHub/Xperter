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

async function ensureSiteExists(projectId: string, siteId: string, token: string): Promise<boolean> {
  if (siteId === projectId) return true;
  try {
    const checkRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (checkRes.ok) return true;
    if (checkRes.status === 404) {
      console.log(`Site '${siteId}' does not exist yet. Attempting automatic creation in project '${projectId}'...`);
      const createRes = await fetch(
        `https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites?siteId=${encodeURIComponent(siteId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      );
      if (createRes.ok) {
        console.log(`Site '${siteId}' created successfully!`);
        return true;
      }
      console.warn(`Note: Auto-creation returned (${createRes.status}). If the site is new, click 'Add another site' in Firebase Console.`);
      return false;
    }
  } catch (err: any) {
    console.warn(`Site check note:`, err?.message || err);
  }
  return false;
}

async function deploySite(
  targetSite: string,
  token: string,
  fileHashMap: Record<string, string>,
  hashToBuffer: Record<string, Buffer>,
): Promise<boolean> {
  console.log(`\n--- Deploying to site: ${targetSite} ---`);
  console.log(`1. Creating Hosting version for '${targetSite}'...`);
  const verRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${targetSite}/versions`, {
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
  if (!verRes.ok) {
    console.warn(`Create version failed for site '${targetSite}' (${verRes.status}): ${await verRes.text()}`);
    return false;
  }
  const version = await verRes.json();
  const versionName = version.name;
  console.log('   Version created:', versionName);

  console.log(`2. Populating files for '${targetSite}'...`);
  const popRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: fileHashMap })
  });
  if (!popRes.ok) {
    console.warn(`Populate files failed for '${targetSite}': ${await popRes.text()}`);
    return false;
  }
  const popData = await popRes.json();
  const uploadRequiredHashes: string[] = popData.uploadRequiredHashes || [];
  const uploadUrl = popData.uploadUrl;
  console.log(`   ${uploadRequiredHashes.length} files need uploading.`);

  if (uploadRequiredHashes.length > 0 && uploadUrl) {
    console.log('3. Uploading missing files...');
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
  }

  console.log(`4. Finalizing version for '${targetSite}'...`);
  const finRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'FINALIZED' })
  });
  if (!finRes.ok) {
    console.warn(`Finalize failed for '${targetSite}': ${await finRes.text()}`);
    return false;
  }

  console.log(`5. Releasing version for '${targetSite}'...`);
  const relRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${targetSite}/releases?versionName=${versionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!relRes.ok) {
    console.warn(`Release failed for '${targetSite}': ${await relRes.text()}`);
    return false;
  }
  const release = await relRes.json();
  console.log(`   Release live for '${targetSite}':`, release.name);
  console.log(`\n🎉 Site successfully deployed to:`);
  console.log(`   https://${targetSite}.web.app`);
  console.log(`   https://${targetSite}.firebaseapp.com\n`);
  return true;
}

async function main() {
  let configuredSite: string | undefined;
  try {
    const fbJson = JSON.parse(fs.readFileSync(path.resolve('firebase.json'), 'utf8'));
    configuredSite = fbJson.hosting?.site;
  } catch {}
  const primarySiteId =
    process.env.FIREBASE_HOSTING_SITE ||
    configuredSite ||
    'xperter-workspace';
  const publicDir = path.resolve('.output/public');

  if (!fs.existsSync(publicDir)) {
    throw new Error(`Directory ${publicDir} does not exist`);
  }

  console.log('1. Authenticating with Firebase...');
  const sa = getServiceAccount();
  const token = await getAccessToken(sa);

  console.log('2. Scanning files and computing SHA256 hashes...');
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

  const targetSites = Array.from(new Set([primarySiteId, sa.project_id].filter(Boolean)));
  for (const currentSite of targetSites) {
    if (currentSite !== sa.project_id) {
      await ensureSiteExists(sa.project_id, currentSite, token);
    }
    await deploySite(currentSite, token, fileHashMap, hashToBuffer);
  }

  const domainsToAuthorize = [
    'xperter-workspace.web.app',
    'xperter-workspace.firebaseapp.com',
    'nagarajps9894-sketch.github.io',
    'xperter.github.io'
  ];
  await syncAuthorizedDomains(sa.project_id, token, domainsToAuthorize);
  await ensureFirestoreDatabaseExists(sa.project_id, token);
  await deployFirestoreRules(sa.project_id, token);
}

async function ensureFirestoreDatabaseExists(projectId: string, token: string) {
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) {
      console.log('Default Firestore database does not exist. Attempting creation in project:', projectId);
      const createRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locationId: 'nam5',
          type: 'FIRESTORE_NATIVE'
        })
      });
      if (createRes.ok) {
        console.log('Successfully requested Firestore default database creation!');
      } else {
        console.warn(`Firestore database creation note (${createRes.status}):`, await createRes.text());
      }
    }
  } catch (err: any) {
    console.warn('Note on Firestore database check:', err?.message || err);
  }
}

async function deployFirestoreRules(projectId: string, token: string) {
  const rulesPath = path.resolve('firestore.rules');
  if (!fs.existsSync(rulesPath)) return;
  const content = fs.readFileSync(rulesPath, 'utf8');
  console.log('\nDeploying Firestore security rules...');

  try {
    const rulesetRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          files: [
            {
              name: 'firestore.rules',
              content
            }
          ]
        }
      })
    });

    if (!rulesetRes.ok) {
      console.warn(`Firestore ruleset creation note (${rulesetRes.status}): ${await rulesetRes.text()}`);
      return;
    }

    const rulesetData = await rulesetRes.json();
    const rulesetName = rulesetData.name;
    console.log(`Created Firestore ruleset: ${rulesetName}`);

    // Update release for cloud.firestore
    let releaseRes = await fetch(
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          release: {
            name: `projects/${projectId}/releases/cloud.firestore`,
            rulesetName
          },
          updateMask: 'rulesetName'
        })
      }
    );

    if (releaseRes.status === 404) {
      releaseRes = await fetch(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `projects/${projectId}/releases/cloud.firestore`,
            rulesetName
          })
        }
      );
    }

    if (releaseRes.ok) {
      console.log('Successfully deployed and released Firestore security rules!');
    } else {
      console.warn(`Firestore release update note (${releaseRes.status}): ${await releaseRes.text()}`);
    }
  } catch (err: any) {
    console.warn('Failed to deploy Firestore rules:', err?.message || err);
  }
}

async function syncAuthorizedDomains(projectId: string, token: string, newDomains: string[]) {
  console.log('\nChecking Firebase Auth authorized domains...');
  const endpoints = [
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/config`
  ];

  let currentDomains: string[] = [];
  let activeEndpoint = endpoints[0];

  for (const ep of endpoints) {
    try {
      const getRes = await fetch(ep, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Goog-User-Project': projectId
        }
      });
      if (getRes.ok) {
        const data = await getRes.json();
        if (Array.isArray(data.authorizedDomains)) {
          currentDomains = data.authorizedDomains;
          activeEndpoint = ep;
          break;
        }
      }
    } catch {}
  }

  const merged = Array.from(new Set([
    'localhost',
    `${projectId}.firebaseapp.com`,
    `${projectId}.web.app`,
    ...currentDomains,
    ...newDomains
  ].filter(Boolean)));

  const missing = newDomains.filter(d => !currentDomains.includes(d));
  if (missing.length === 0 && currentDomains.length > 0) {
    console.log('All required domains are already in Firebase Auth authorized domains.');
    return;
  }

  console.log(`Adding missing authorized domains: ${missing.join(', ')}...`);
  try {
    const patchRes = await fetch(`${activeEndpoint}?updateMask=authorizedDomains`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId
      },
      body: JSON.stringify({
        authorizedDomains: merged
      })
    });

    if (patchRes.ok) {
      console.log('Successfully updated Firebase Auth authorized domains via API!');
    } else {
      console.warn(`Could not update authorized domains automatically (${patchRes.status}): ${await patchRes.text()}`);
    }
  } catch (err: any) {
    console.warn('Failed to update authorized domains via API:', err?.message || err);
  }
}

main().catch((err) => {
  console.error('Deployment error:', err.message || err);
  process.exit(1);
});
