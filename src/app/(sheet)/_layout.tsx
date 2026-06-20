import { Slot } from "expo-router";
import type { JSX } from "react";

export default function SheetLayout({ segment }: { segment: string }): JSX.Element {
  if (segment.includes("sheet")) return <Slot />;
  return <Slot />;
}
