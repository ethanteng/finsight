// The player loads /video/embed, which shows whichever video is configured in
// Global Config: a redirect to YouTube, or our own player page for a video
// file (see lib/teaser-video). The video can change without a deploy.
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
