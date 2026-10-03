"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SECTION_ICONS } from "../../constants";
import { sectionAnchor } from "../../helpers";
import { s } from "../../styles";

type Kind = keyof typeof SECTION_ICONS;

/** AC-51: collapsible card. The h2 (with the toggle inside) stays in the DOM when collapsed (NFR-6). */
export function SectionCard({
  kind,
  open,
  onToggle,
  children,
}: {
  kind: Kind;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const Ico = Icon[SECTION_ICONS[kind]];
  const bodyId = `${sectionAnchor(kind)}-body`;
  return (
    <section id={sectionAnchor(kind)} style={s.card}>
      <h2 style={s.h2}>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span style={s.iconBox}>
            <Ico size={18} />
          </span>
          {t(`sectionNames.${kind}`)}
          <span style={s.chevron(open)}>
            <Icon.ChevronDown size={18} />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} style={s.cardBody}>
        {open && children}
      </div>
    </section>
  );
}
