"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SECTION_KINDS } from "../../constants";
import { sectionAnchor } from "../../helpers";
import css from "../../OnboardingTourView.module.css";
import { s } from "../../styles";

type Kind = (typeof SECTION_KINDS)[number];

/** AC-50 "On this page"; hidden below 1280 px by CSS (D21). Highlights the section at the top of the viewport. */
export function TourToc({ onSelect }: { onSelect: (kind: Kind) => void }) {
  const t = useTranslations("onboarding");
  const [active, setActive] = React.useState<Kind>(SECTION_KINDS[0]);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return; // jsdom
    // a band at the top ~30% of the viewport: the section crossing it is "current"
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting)
            setActive(e.target.id.replace("onb-", "") as Kind);
        }
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const k of SECTION_KINDS) {
      const el = document.getElementById(sectionAnchor(k));
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <nav className={css.toc} style={s.toc} aria-label={t("tocNav")}>
      <div style={s.tocTitle}>{t("toc")}</div>
      {SECTION_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          style={s.tocItem(active === k)}
          aria-current={active === k ? "true" : undefined}
          onClick={() => {
            setActive(k);
            onSelect(k);
          }}
        >
          {t(`sectionNames.${k}`)}
        </button>
      ))}
    </nav>
  );
}
