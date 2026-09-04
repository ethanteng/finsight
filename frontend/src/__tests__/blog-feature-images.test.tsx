import { render, screen, within } from "@testing-library/react";
import { MarketingBlogPage } from "@/components/marketing/MarketingSubpage";
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
});
