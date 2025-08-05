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
  children?: React.ReactNode;
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
          // Extract the LaTeX content (remove the brackets)
          const latexContent = part.slice(1, -1);
          
          // Check if it contains display math indicators
          if (latexContent.includes('\\text{') || latexContent.includes('\\left(') || latexContent.includes('\\right(')) {
            // This looks like display math
            return (
              <div key={index} className="math-block">
                <BlockMath math={latexContent} />
              </div>
            );
          } else {
            // This looks like inline math
            return <InlineMath key={index} math={latexContent} />;
          }
        } catch (error) {
          // If KaTeX can't parse it, return as regular text
          console.warn('Failed to parse LaTeX:', part, error);
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
            }}
          >
            {part}
          </ReactMarkdown>
        </div>
      );
    });
  };

  return (
    <div className={`text-gray-300 ${className}`}>
      {processMathExpressions(processedText)}
    </div>
  );
} 