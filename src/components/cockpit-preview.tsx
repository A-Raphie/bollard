"use client";

import { useEffect, useRef } from "react";
import { TableCanvas, type CanvasPulse, type RopePhase } from "@/components/table-canvas";
import { TableSim } from "@/lib/sim/engine";
import { initialScene } from "@/lib/scene";

// Landing-page proof object: the real renderer in its idle state, framed.
const simHolder: { current: TableSim | null } = { current: null };
const pulsesHolder: { current: CanvasPulse[] } = { current: [] };

export function CockpitPreview() {
  useEffect(() => {
    if (!simHolder.current) simHolder.current = new TableSim(initialScene());
    const iv = setInterval(() => simHolder.current?.advance(), 400);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="h-[420px] w-full">
      <TableCanvas
        simRef={simHolder}
        phase={"idle" as RopePhase}
        activeArm={null}
        pulses={pulsesHolder}
      />
    </div>
  );
}
