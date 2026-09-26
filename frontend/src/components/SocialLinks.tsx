// Ask Linc's social profiles, shared by the marketing footer and the older
// site footer so the two cannot drift apart.

// Brand marks from Simple Icons (CC0), except Bluesky's, which is its own
// published butterfly. Drawn in currentColor so they follow the footer's link colours.
const SOCIAL_LINKS = [
  {
    label: "X",
    href: "https://x.com/asklinc",
    viewBox: "0 0 24 24",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  {
    label: "Bluesky",
    href: "https://bsky.app/profile/asklinc.com",
    viewBox: "0 0 600 530",
    path: "m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/asklinc/",
    viewBox: "0 0 24 24",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/asklinc/",
    viewBox: "0 0 24 24",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
] as const;

export function SocialLinks({
  className,
  linkClassName,
  iconClassName,
  badgeClassName,
}: {
  className?: string;
  linkClassName?: string;
  iconClassName?: string;
  badgeClassName?: string;
}) {
  return (
    <div className={className}>
      {SOCIAL_LINKS.map((item) => (
        <a key={item.href} className={linkClassName} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`Ask Linc on ${item.label}`}>
          <svg className={iconClassName} viewBox={item.viewBox} aria-hidden="true" focusable="false"><path d={item.path} /></svg>
        </a>
      ))}
      {/* There's An AI For That's badge, kept as they supply it: their hosted image, ref params and nofollow. */}
      <a className={linkClassName} href="https://theresanaiforthat.com/ai/ask-linc/?ref=social-icon&v=12845145" target="_blank" rel="nofollow noopener">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={badgeClassName} src="https://media.theresanaiforthat.com/social/icon_full.svg" alt="Featured on TAAFT" width={36} height={36} />
      </a>
    </div>
  );
}
