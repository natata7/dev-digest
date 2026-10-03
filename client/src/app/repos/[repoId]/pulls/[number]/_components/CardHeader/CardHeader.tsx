import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

/** Card header: icon + label (uppercase unless `plain`) with an optional right slot. */
export function CardHeader({
  icon,
  children,
  right,
  plain,
}: {
  icon: IconName;
  children: React.ReactNode;
  right?: React.ReactNode;
  plain?: boolean;
}) {
  const I = Icon[icon];
  return (
    <div style={s.header}>
      <span style={plain ? s.plainLabel : s.label}>
        <I size={14} />
        {children}
      </span>
      {right}
    </div>
  );
}
