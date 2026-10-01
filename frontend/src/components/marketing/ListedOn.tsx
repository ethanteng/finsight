/* eslint-disable @next/next/no-img-element -- directory badges are the images each site hosts, loaded as they supply them */

// Each directory's badge as that site supplies it: its hosted image and its
// link with the tracking params. Alt text is ours, since it names the link.
// Every image host here must also be in the CSP img-src (lib/csp.ts).
export const LISTED_ON_BADGES = [
  {
    name: "AlternativeTo",
    href: "https://alternativeto.net/software/ask-linc/about/?utm_source=badge&utm_medium=referral",
    rel: "noopener",
    src: "https://alternativeto.net/static/badges/badge-compact-color.svg",
    alt: "Ask Linc on AlternativeTo",
    width: 244,
    height: 79,
  },
  {
    name: "SaaSHub",
    href: "https://www.saashub.com/ask-linc?utm_source=badge&utm_campaign=badge&utm_content=ask-linc&badge_variant=color&badge_kind=approved",
    rel: "noopener",
    src: "https://cdn-b.saashub.com/img/badges/approved-color.png?v=1",
    alt: "Ask Linc approved on SaaSHub",
    width: 300,
    height: 100,
  },
  {
    name: "There's An AI For That",
    href: "https://theresanaiforthat.com/ai/ask-linc/?ref=featured&v=12845145",
    rel: "nofollow noopener",
    src: "https://media.theresanaiforthat.com/featured-on-taaft.png?width=600",
    alt: "Ask Linc featured on There’s An AI For That",
    width: 600,
    height: 125,
  },
  {
    name: "Uneed",
    href: "https://www.uneed.best/tool/ask-linc",
    rel: "noopener",
    src: "https://www.uneed.best/EMBED1.png",
    alt: "Ask Linc featured on Uneed",
    width: 462,
    height: 152,
  },
  {
    name: "Peerlist",
    href: "https://peerlist.io/ethanteng/project/ask-linc",
    rel: "noreferrer",
    src: "https://peerlist.io/api/v1/projects/embed/PRJH8OEQGERLOLEMOIDDKRP86BDBD6?showUpvote=true&theme=light",
    alt: "Ask Linc on Peerlist",
    width: 296,
    height: 72,
  },
  {
    name: "PeerPush",
    href: "https://peerpush.com/p/ask-linc",
    rel: "noopener",
    src: "https://peerpush.com/p/ask-linc/badge.png",
    alt: "Ask Linc on PeerPush",
    width: 460,
    height: 130,
  },
  {
    name: "Smol Launch",
    href: "https://smollaunch.com/products/ask-linc?utm_source=badge&utm_medium=referral&utm_campaign=featured&utm_content=ask-linc",
    rel: "noopener",
    src: "https://smollaunch.com/badges/featured.svg",
    alt: "Ask Linc featured on Smol Launch",
    width: 250,
    height: 60,
  },
] as const;

function BadgeList({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="listed-on-list" aria-hidden={hidden || undefined}>
      {LISTED_ON_BADGES.map((badge) => (
        <li key={badge.name}>
          <a href={badge.href} target="_blank" rel={badge.rel} tabIndex={hidden ? -1 : undefined}>
            {/* Not lazy: the track moves by a compositor animation, which never
                tells the lazy loader a badge has slid into view. */}
            <img src={badge.src} alt={hidden ? "" : badge.alt} width={badge.width} height={badge.height} decoding="async" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ListedOn() {
  return (
    <section className="listed-on" aria-labelledby="listed-on-title">
      <div className="shell">
        <h2 className="section-kicker listed-on-title" id="listed-on-title">VERIFIED AND LISTED ON</h2>
        {/* The second copy exists only so the scroll loops without a seam. */}
        <div className="listed-on-viewport">
          <div className="listed-on-track">
            <BadgeList />
            <BadgeList hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
