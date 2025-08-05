// Test the regex formatting function
function formatResponseWithRegex(rawResponse: string): string {
  return rawResponse
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
    })
    
    // Clean up any remaining formatting issues
    .trim();
}

describe('Response Formatting', () => {
  it('should fix bullet list formatting', () => {
    const messyResponse = `
    
    - 
    First bullet
    
    - 
    Second bullet
    
    `;

    const formatted = formatResponseWithRegex(messyResponse);
    
    expect(formatted).toContain('- First bullet');
    expect(formatted).toContain('- Second bullet');
    expect(formatted).not.toContain('- \nFirst bullet');
  });

  it('should fix numbered list formatting', () => {
    const messyResponse = `
    
    1. 
    First item
    
    2. 
    Second item
    
    `;

    const formatted = formatResponseWithRegex(messyResponse);
    
    expect(formatted).toContain('1. First item');
    expect(formatted).toContain('2. Second item');
    expect(formatted).not.toContain('1. \nFirst item');
  });

  it('should remove extra blank lines between list items', () => {
    const messyResponse = `
    
    - First item
    
    - Second item
    
    - Third item
    
    `;

    const formatted = formatResponseWithRegex(messyResponse);
    
    expect(formatted).toContain('- First item\n- Second item');
    expect(formatted).not.toContain('- First item\n\n- Second item');
  });
}); 