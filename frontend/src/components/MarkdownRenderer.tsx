import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// Add custom styles for KaTeX in dark theme
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

interface CodeComponentProps {
  className?: string;
  children: React.ReactNode;
}

export default function MarkdownRenderer({ children, className = '' }: MarkdownRendererProps) {
  // Pre-process the text to improve formatting
  const preprocessText = (text: string) => {
    return text
      // Fix bullet lists - ensure bullet and text are on same line
      .replace(/(\n)(\s*[-*+]\s*)(\n)(\s*)/g, '\n$2')
      .replace(/([-*+])\s*\n\s*(.+)/g, '$1 $2')
      
      // Fix numbered lists - ensure number and text are on same line
      .replace(/(\n)(\s*\d+\.\s*)(\n)(\s*)/g, '\n$2')
      .replace(/(\d+\.)\s*\n\s*(.+)/g, '$1 $2')
      
      // Remove extra blank lines between list items
      .replace(/([-*+] .+)\n\n(?=[-*+] )/g, '$1\n')
      .replace(/(\d+\. .+)\n\n(?=\d+\. )/g, '$1\n')
      
      // Ensure proper spacing around headers
      .replace(/(\n)(#{1,6}\s)/g, '\n\n$2')
      
      // Ensure proper spacing around code blocks
      .replace(/(\n)(```)/g, '\n\n$2')
      
      // Fix multiple consecutive line breaks
      .replace(/\n{3,}/g, '\n\n')
      
      // Remove extra spaces at beginning of lines
      .replace(/^\s+/gm, '')
      
      // Ensure consistent list formatting
      .replace(/^\s*[-*+]\s+/gm, '- ')
      .replace(/^\s*\d+\.\s+/gm, (match) => {
        const number = match.match(/\d+/)?.[0] || '1';
        return `${number}. `;
      });
  };

  const processedText = preprocessText(children);

  // Function to detect and render LaTeX expressions
  const processMathExpressions = (text: string) => {
    // Split by potential LaTeX delimiters
    const parts = text.split(/(\[.*?\])/g);
    
    return parts.map((part, index) => {
      // Check if this part looks like LaTeX (starts and ends with [])
      if (part.startsWith('[') && part.endsWith(']')) {
        try {
          const mathContent = part.slice(1, -1);
          // Check if it's a block math expression (contains \frac, \text, etc.)
          if (mathContent.includes('\\frac') || mathContent.includes('\\text') || mathContent.includes('\\left') || mathContent.includes('\\right')) {
            return (
              <div key={index} className="math-block">
                <BlockMath math={mathContent} />
              </div>
            );
          } else {
            // Inline math
            return <InlineMath key={index} math={mathContent} />;
          }
        } catch (error) {
          // If KaTeX fails, fall back to regular text
          return <span key={index}>{part}</span>;
        }
      }
      
      // Regular text - render with ReactMarkdown
      return (
        <div key={index} className={`prose prose-invert prose-sm max-w-none [&>*]:text-gray-300 [&>h1]:text-white [&>h2]:text-white [&>h3]:text-white [&>strong]:text-white [&>ul]:list-disc [&>ul]:list-inside [&>li]:text-gray-300 ${className}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              // Custom component for better list rendering
              ul: ({ children, ...props }) => (
                <ul className="list-disc list-inside space-y-1" {...props}>
                  {children}
                </ul>
              ),
              ol: ({ children, ...props }) => (
                <ol className="list-decimal list-inside space-y-1" {...props}>
                  {children}
                </ol>
              ),
              li: ({ children, ...props }) => (
                <li className="text-gray-300" {...props}>
                  {children}
                </li>
              ),
              // Better code block rendering
              code: ({ className, children }: CodeComponentProps) => {
                const isInline = !className?.includes('language-');
                return !isInline ? (
                  <pre className="bg-gray-800 rounded-lg p-4 overflow-x-auto">
                    <code className={className}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code className="bg-gray-700 px-1 py-0.5 rounded text-sm">
                    {children}
                  </code>
                );
              },
              // Better blockquote rendering
              blockquote: ({ children, ...props }) => (
                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400" {...props}>
                  {children}
                </blockquote>
              ),
              // Enhanced calculation display
              p: ({ children, ...props }) => {
                const content = children?.toString() || '';
                
                // Check if this paragraph contains calculation patterns
                if (content.includes('Step 1:') || content.includes('Step 2:') || content.includes('Final Result:')) {
                  return (
                    <div className="calculation-block bg-gray-800 border border-gray-600 rounded-lg p-4 my-4" {...props}>
                      {children}
                    </div>
                  );
                }
                
                // Check if this paragraph contains mathematical expressions
                if (content.includes('=') && (content.includes('$') || content.includes('%'))) {
                  return (
                    <div className="math-expression bg-gray-800 border border-gray-600 rounded-lg p-3 my-3" {...props}>
                      {children}
                    </div>
                  );
                }
                
                // Check if this paragraph contains verification text
                if (content.includes('Verification:') || content.includes('verification:')) {
                  return (
                    <div className="verification-block bg-green-900/20 border border-green-500/50 rounded-lg p-3 my-3" {...props}>
                      <span className="text-green-400 font-medium">✓ </span>
                      {children}
                    </div>
                  );
                }
                
                // Regular paragraph
                return <p className="text-gray-300" {...props}>{children}</p>;
              },
              // Enhanced strong/bold text for financial values
              strong: ({ children, ...props }) => (
                <strong className="text-white font-semibold bg-blue-900/30 px-1 py-0.5 rounded" {...props}>
                  {children}
                </strong>
              ),
            }}
          >
            {part}
          </ReactMarkdown>
        </div>
      );
    });
  };

  return (
    <div className="markdown-renderer">
      {processMathExpressions(processedText)}
    </div>
  );
} 