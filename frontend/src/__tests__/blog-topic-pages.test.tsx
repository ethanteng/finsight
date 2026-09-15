import { render, screen, within } from "@testing-library/react";
import { MarketingBlogPage, MarketingBlogTopicPage } from "@/components/marketing/MarketingSubpage";
import { listBlogTopics, postsForTopic, findBlogTopic } from "@/lib/blog-topics";
import type { GhostPost } from "@/lib/ghost";

const posts: GhostPost[] = [
  {
    id: "featured",
    slug: "coast-fire-assumptions",
    title: "Coast FIRE Assumptions",
    excerpt: "Return and withdrawal rates.",
    published_at: "2026-09-14T12:00:00.000Z",
    reading_time: 6,
    tags: [{ id: "fire", name: "FIRE", slug: "fire" }],
  },
  {
    id: "second",
    slug: "should-i-sell-employer-stock",
    title: "Should I Sell Employer Stock?",
    excerpt: "Weigh concentration risk.",
    published_at: "2026-09-13T12:00:00.000Z",
    reading_time: 6,
    // No slug on the tag: Ghost tags normally have one, but the label must
    // still resolve to a usable topic URL.
    tags: [{ id: "portfolio", name: "Portfolio Analysis" }],
  },
  {
    id: "third",
    slug: "coast-fire-how-to-calculate",
    title: "Coast FIRE: How to Calculate",
    excerpt: "Stress-test your number.",
    published_at: "2026-09-11T12:00:00.000Z",
    reading_time: 8,
    tags: [{ id: "fire", name: "FIRE", slug: "fire" }],
  },
  {
    id: "untagged",
    slug: "untagged-post",
    title: "Untagged post",
    excerpt: "No tags at all.",
    published_at: "2026-09-10T12:00:00.000Z",
    reading_time: 3,
    tags: [],
  },
];

describe("blog topic navigation", () => {
  it("links each category label on the index to that topic's archive", () => {
    render(<MarketingBlogPage ghostPosts={posts} />);

    const fireLabels = screen.getAllByRole("link", { name: "FIRE" });
    expect(fireLabels).toHaveLength(2);
    for (const label of fireLabels) {
      expect(label).toHaveAttribute("href", "/blog/topics/fire");
    }
    expect(screen.getByRole("link", { name: "PORTFOLIO ANALYSIS" })).toHaveAttribute(
      "href",
      "/blog/topics/portfolio-analysis",
    );
  });

  it("leaves an untagged post's label as plain text", () => {
    render(<MarketingBlogPage ghostPosts={posts} />);

    expect(screen.queryByRole("link", { name: "ASK LINC BLOG" })).not.toBeInTheDocument();
    expect(screen.getByText("ASK LINC BLOG")).toBeInTheDocument();
  });

  it("groups topics by primary tag with a post count", () => {
    expect(listBlogTopics(posts)).toEqual([
      { name: "FIRE", slug: "fire", count: 2 },
      { name: "Portfolio Analysis", slug: "portfolio-analysis", count: 1 },
    ]);
  });

  it("returns only the posts whose primary tag is the topic", () => {
    expect(postsForTopic(posts, "fire").map((post) => post.id)).toEqual(["featured", "third"]);
    expect(findBlogTopic(posts, "not-a-topic")).toBeNull();
  });

  it("renders a topic archive with its posts and links to sibling topics", () => {
    const topic = findBlogTopic(posts, "fire");
    render(
      <MarketingBlogTopicPage
        topic={topic!}
        posts={postsForTopic(posts, "fire")}
        allTopics={listBlogTopics(posts)}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "FIRE" })).toBeInTheDocument();
    expect(screen.getByText("2 posts on fire from the Ask Linc blog.")).toBeInTheDocument();

    const grid = document.querySelector(".post-grid") as HTMLElement;
    expect(within(grid).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Coast FIRE Assumptions",
      "Coast FIRE: How to Calculate",
    ]);

    // Cards on the archive keep the label but do not link back to this page.
    expect(within(grid).queryByRole("link", { name: "FIRE" })).not.toBeInTheDocument();
    const gridLabels = Array.from(grid.querySelectorAll(".post-category"));
    expect(gridLabels.map((label) => label.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(gridLabels.map((label) => label.textContent)).toEqual(["FIRE", "FIRE"]);

    const topicNav = screen.getByRole("navigation", { name: "Blog topics" });
    expect(within(topicNav).getByRole("link", { name: "All posts" })).toHaveAttribute("href", "/blog");
    expect(within(topicNav).getByRole("link", { name: "Portfolio Analysis" })).toHaveAttribute(
      "href",
      "/blog/topics/portfolio-analysis",
    );
    // The topic you are already on is not offered again.
    expect(within(topicNav).queryByRole("link", { name: "FIRE" })).not.toBeInTheDocument();
  });
});
