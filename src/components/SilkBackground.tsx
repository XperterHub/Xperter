import silk from "@/assets/silk.jpg";

export function SilkBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src={silk} alt="" width={1920} height={1088} className="silk-background-image h-full w-full scale-105 object-cover" />
      <div className="absolute inset-0 bg-background/20" />
    </div>
  );
}
