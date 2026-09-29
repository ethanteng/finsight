// The player loads /video/embed, which redirects to whichever video is
// configured in Global Config (see lib/teaser-video), so the video can change
// without a deploy.
const TEASER_VIDEO_SRC = "/video/embed";

export function TeaserVideo() {
  return (
    <div className="teaser-video">
      <iframe
        src={TEASER_VIDEO_SRC}
        title="Ask Linc teaser video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        // YouTube refuses to play an embed that arrives without a referrer.
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
