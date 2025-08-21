"use client";
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { type GhostPost } from '@/lib/ghost';

interface BlogPostsListProps {
  posts: GhostPost[];
}

export default function BlogPostsList({ posts }: BlogPostsListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Extract unique categories from posts
  const categories = ['All', ...Array.from(
    new Set(
      posts
        .map(post => post.tags?.[0]?.name || 'Uncategorized')
        .filter(Boolean)
    )
  )];

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
  };

  const filteredPosts = selectedCategory === 'All' 
    ? posts 
    : posts.filter(post => post.tags?.[0]?.name === selectedCategory);

  return (
    <>
      {/* Category Navigation */}
      <div className="mb-12">
        <div className="flex flex-wrap justify-center gap-3">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryFilter(category)}
              className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                selectedCategory === category
                  ? 'bg-green-500 text-white shadow-lg scale-105'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No posts found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredPosts.map((post) => {
            return (
              <Link 
                key={post.id} 
                href={`/blog/${post.slug || ''}`}
                className="block"
              >
                <article className="bg-gray-800 rounded-lg border border-gray-700 hover:border-green-500 transition-all duration-300 cursor-pointer group">
                  <div className="p-8">
                    {/* Category badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="px-3 py-1 text-sm font-medium bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                        {post.tags?.[0]?.name || 'Financial News'}
                      </span>
                    </div>
                    
                    {/* Title */}
                    <h2 className="text-2xl font-bold text-white mb-4 group-hover:text-green-400 transition-colors">
                      {post.title || 'Untitled Post'}
                    </h2>
                    
                    {/* Excerpt */}
                    {post.excerpt && (
                      <p className="text-gray-300 mb-6 leading-relaxed line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}
                    
                    {/* Meta information */}
                    <div className="flex items-center justify-between text-sm text-gray-400">
                      <div className="flex items-center gap-3">
                        {post.authors?.[0]?.profile_image && (
                          <Image
                            src={post.authors[0].profile_image}
                            alt={post.authors[0].name || 'Author'}
                            width={32}
                            height={32}
                            className="rounded-full border-2 border-gray-600"
                          />
                        )}
                        <span className="text-white font-medium">{post.authors?.[0]?.name || 'Ethan Teng'}</span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {post.reading_time && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {post.reading_time} min read
                          </span>
                        )}
                        {post.published_at && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(post.published_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
