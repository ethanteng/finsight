import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Add custom styles for markdown in dark theme
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

interface CodeComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export default function MarkdownRenderer({ children, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-renderer prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom list rendering
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside space-y-1 my-3" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside space-y-1 my-3" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-gray-300 leading-relaxed" {...props}>
              {children}
            </li>
          ),
          // Code block rendering
          code: ({ className, children }: CodeComponentProps) => {
            const isInline = !className?.includes('language-');
            return !isInline ? (
              <pre className="bg-gray-800 rounded-lg p-4 overflow-x-auto my-4 border border-gray-600">
                <code className={`${className} text-gray-200`}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm text-gray-200">
                {children}
              </code>
            );
          },
          // Blockquote rendering
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-3 italic text-gray-400 bg-gray-800/50 rounded-r" {...props}>
              {children}
            </blockquote>
          ),
          // Paragraph rendering
          p: ({ children, ...props }) => (
            <p className="text-gray-300 leading-relaxed my-3" {...props}>
              {children}
            </p>
          ),
          // Header rendering
          h1: ({ children, ...props }) => (
            <h1 className="text-3xl font-bold text-white mt-6 mb-3" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-2xl font-semibold text-white mt-5 mb-3" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-xl font-semibold text-white mt-4 mb-2" {...props}>
              {children}
            </h3>
          ),
          // Strong/bold text
          strong: ({ children, ...props }) => (
            <strong className="text-white font-semibold" {...props}>
              {children}
            </strong>
          ),
          // Table rendering for financial data
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-600 rounded-lg" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-gray-700" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="bg-gray-800" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="border-b border-gray-600" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th className="px-4 py-2 text-left text-white font-semibold" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-2 text-gray-300" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
