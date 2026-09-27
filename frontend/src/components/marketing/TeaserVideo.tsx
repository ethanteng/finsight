// YouTube's privacy-enhanced host sets no cookies until the visitor presses
// play. It is also the only YouTube host frame-src allows, so an embed from
// youtube.com itself would be refused.
const TEASER_VIDEO_SRC = "https://www.youtube-nocookie.com/embed/GRBboPyuL5U?rel=0";

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
