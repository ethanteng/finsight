import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// Add custom styles for KaTeX in dark theme
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export default function MarkdownRenderer({ children, className = '' }: MarkdownRendererProps) {
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
          <ReactMarkdown>
            {part}
          </ReactMarkdown>
        </div>
      );
    });
  };

  return (
    <div className={`text-gray-300 ${className}`}>
      {processMathExpressions(children)}
    </div>
  );
} 