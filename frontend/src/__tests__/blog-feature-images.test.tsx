import { render, screen, within } from "@testing-library/react";
import { MarketingArticlePage, MarketingBlogPage } from "@/components/marketing/MarketingSubpage";
import type { GhostPost } from "@/lib/ghost";

const posts: GhostPost[] = [
  {
    id: "featured",
    slug: "featured-post",
    title: "Featured post",
    feature_image: "https://storage.ghost.io/content/images/featured.jpg",
    feature_image_alt: "A chart showing the featured analysis",
    published_at: "2026-09-03T12:00:00.000Z",
    reading_time: 4,
    tags: [{ id: "ai", name: "AI Personal Finance" }],
  },
  {
    id: "fallback",
    slug: "fallback-post",
    title: "Fallback post",
    feature_image: null,
    published_at: "2026-09-02T12:00:00.000Z",
    reading_time: 5,
    tags: [{ id: "retirement", name: "Retirement" }],
  },
];

describe("blog feature images", () => {
  it("maps each Ghost feature image to its matching card and keeps artwork for missing images", () => {
    render(<MarketingBlogPage ghostPosts={posts} />);

    const featuredLink = screen.getByRole("link", { name: "Read Featured post" });
    const featureImage = within(featuredLink).getByRole("img", {
      name: "A chart showing the featured analysis",
    });
    expect(featuredLink).toHaveAttribute("href", "/blog/featured-post");
    expect(featuredLink).toHaveClass("post-art-image");
    expect(featureImage).toHaveAttribute("src", expect.stringContaining("storage.ghost.io"));

    const fallbackLink = screen.getByRole("link", { name: "Read Fallback post" });
    expect(fallbackLink).toHaveAttribute("href", "/blog/fallback-post");
    expect(fallbackLink).not.toHaveClass("post-art-image");
    expect(within(fallbackLink).queryByRole("img")).not.toBeInTheDocument();
    expect(within(fallbackLink).getByText("02")).toBeInTheDocument();
    expect(within(fallbackLink).getByText("RETIREMENT")).toBeInTheDocument();
  });

  it("uses the Ghost feature image in an article header", () => {
    const { container } = render(
      <MarketingArticlePage post={posts[0]} processedHtml="<p>Article body</p>" />,
    );

    const headerArtwork = container.querySelector(".article-art");
    const featureImage = screen.getByRole("img", {
      name: "A chart showing the featured analysis",
    });
    expect(headerArtwork).toHaveClass("article-art-image");
    expect(featureImage).toHaveClass("article-feature-image");
    expect(featureImage).toHaveAttribute("src", expect.stringContaining("storage.ghost.io"));
  });

  it("keeps the branded article artwork when Ghost has no feature image", () => {
    const { container } = render(
      <MarketingArticlePage post={posts[1]} processedHtml="<p>Article body</p>" />,
    );

    const headerArtwork = container.querySelector(".article-art");
    expect(headerArtwork).toHaveClass("blue");
    expect(headerArtwork).not.toHaveClass("article-art-image");
    expect(within(headerArtwork as HTMLElement).queryByRole("img")).not.toBeInTheDocument();
    expect(within(headerArtwork as HTMLElement).getByText("ASK LINC / FIELD NOTE")).toBeInTheDocument();
  });
});
