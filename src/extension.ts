import * as vscode from 'vscode';

interface TagMatch {
    index: number;
    tag: string;
}

interface TagResult {
    tagName?: string;
    message?: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('XML Epsilon Tag Closer is now active!');

    let disposable = vscode.commands.registerCommand('epsilon-tag-closer.closeEpsilonTag', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Only activate in XML and HTML file types
        const languageId = editor.document.languageId;
        if (!['xml', 'html', 'xhtml', 'svg', 'xaml'].includes(languageId)) {
            // Still allow it to work in any file if the user manually invokes it
            const proceed = true;
            if (!proceed) {
                vscode.window.showInformationMessage('Epsilon Tag Closer is optimized for XML/HTML files.');
                return;
            }
        }

        const document = editor.document;
        const selection = editor.selection;
        
        // Get the current position
        const position = selection.active;
        
        // Get the entire document text
        const documentText = document.getText();
        
        // Get the text up to the current position
        const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        
        // Find the last opened epsilon tag
        const result = findLastOpenedEpsilonTag(textBeforeCursor, documentText);
        console.log("Detected unclosed tag:");

        // Fix: Check if tagName exists before using it
        if (result.tagName !== undefined) {
            console.log("Detected unclosed tag:", result.tagName);
            console.log("Insert position:", position.line, position.character);

            const tagName = result.tagName; // TypeScript now knows it's defined
            editor.edit(editBuilder => {
                editBuilder.insert(position, `</${tagName}>`);
            }).then(success => {
                if (success) {
                    const newPosition = new vscode.Position(
                        position.line,
                        position.character + tagName.length + 3 // "</>".length === 3
                    );
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                }
            });
        }
        
    });

    context.subscriptions.push(disposable);
}
/**
 * Find the last opened epsilon tag that needs to be closed
 * @param textBeforeCursor - Text before cursor position
 * @param fullText - Full document text
 * @returns Result containing tagName or message
 */
function findLastOpenedEpsilonTag(textBeforeCursor: string, fullText: string): TagResult {
    // Regular expressions for finding XML epsilon tags
    // Allowing any XML-valid tag that starts with epsilon or ε
    const openTagRegex = /<((?:ε|epsilon)[a-zA-Z0-9_:.-]*)(?:\s+[^>]*)?>/gi;
    const selfClosingTagRegex = /<((?:ε|epsilon)[a-zA-Z0-9_:.-]*)(?:\s+[^>]*)?\s*\/>/gi;
    const closeTagRegex = /<\/((?:ε|epsilon)[a-zA-Z0-9_:.-]*)>/gi;
    
    // Find all open, self-closing, and closing tags
    const openTags = findAllMatches(textBeforeCursor, openTagRegex);
    const selfClosingTags = findAllMatches(textBeforeCursor, selfClosingTagRegex);
    const closeTags = findAllMatches(textBeforeCursor, closeTagRegex);
    
    // Filter out self-closing tags from open tags
    const actualOpenTags = openTags.filter(openTag => {
        return !selfClosingTags.some(selfClosingTag => 
            selfClosingTag.index === openTag.index && 
            selfClosingTag.tag === openTag.tag
        );
    });
    
    // Create a stack to track open/close tag pairs
    const tagStack: TagMatch[] = [];
    
    // Process tags in order of appearance
    const allTags = [
        ...actualOpenTags.map(tag => ({ ...tag, type: 'open' })),
        ...closeTags.map(tag => ({ ...tag, type: 'close' }))
    ].sort((a, b) => a.index - b.index);
    
    // Build the stack
    for (const tag of allTags) {
        if (tag.type === 'open') {
            tagStack.push(tag);
        } else if (tag.type === 'close') {
            // Find matching open tag
            const matchingOpenIndex = findMatchingOpenTag(tagStack, tag.tag);
            if (matchingOpenIndex !== -1) {
                tagStack.splice(matchingOpenIndex, 1);
            }
        }
    }
    
    // Check if there are any unclosed tags
    if (tagStack.length > 0) {
        // Return the most recent unclosed tag
        return { tagName: tagStack[tagStack.length - 1].tag };
    }
    
    // Check if cursor is inside a CDATA section or comment
    if (isInXmlSpecialSection(textBeforeCursor)) {
        return { message: "Cursor is inside a CDATA section or comment" };
    }
    
    // Check if cursor is inside an epsilon tag but not directly after an opening tag
    const nearestOpenTagMatch = findNearestEpsilonTagContext(textBeforeCursor, fullText);
    if (nearestOpenTagMatch) {
        return { tagName: nearestOpenTagMatch };
    }
    
    return { message: "No unclosed XML epsilon tag found" };
}

/**
 * Find all matches for a regex pattern in text
 * @param text - Text to search
 * @param regex - Regular expression pattern
 * @returns Array of matches with index and tag name
 */
function findAllMatches(text: string, regex: RegExp): TagMatch[] {
    const matches: TagMatch[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            index: match.index,
            tag: match[1]
        });
    }
    
    return matches;
}

/**
 * Find matching open tag in the stack
 * @param stack - Stack of open tags
 * @param closeTag - Tag name to match
 * @returns Index of matching tag or -1
 */
function findMatchingOpenTag(stack: TagMatch[], closeTag: string): number {
    // Look for exact match first (case-insensitive as XML tags are case-sensitive but
    // we're being permissive with epsilon tag variants)
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag.toLowerCase() === closeTag.toLowerCase()) {
            return i;
        }
    }
    
    // If no exact match, try matching epsilon prefix variations
    if (closeTag.toLowerCase().startsWith('ε') || closeTag.toLowerCase().startsWith('epsilon')) {
        for (let i = stack.length - 1; i >= 0; i--) {
            const stackTag = stack[i].tag.toLowerCase();
            const closeTagLower = closeTag.toLowerCase();
            
            // Match epsilon variations (ε vs epsilon prefix)
            if ((stackTag.startsWith('ε') && closeTagLower.startsWith('epsilon')) ||
                (stackTag.startsWith('epsilon') && closeTagLower.startsWith('ε'))) {
                
                const stackTagNormalized = stackTag.startsWith('ε') ? 
                    'epsilon' + stackTag.slice(1) : stackTag;
                    
                const closeTagNormalized = closeTagLower.startsWith('ε') ? 
                    'epsilon' + closeTagLower.slice(1) : closeTagLower;
                    
                if (stackTagNormalized === closeTagNormalized) {
                    return i;
                }
            }
        }
    }
    
    return -1;
}

/**
 * Check if cursor is inside XML special section (CDATA or comment)
 * @param textBeforeCursor - Text before cursor position
 * @returns True if in special section
 */
function isInXmlSpecialSection(textBeforeCursor: string): boolean {
    // Check for unclosed CDATA section
    const cdataStart = textBeforeCursor.lastIndexOf('<![CDATA[');
    if (cdataStart !== -1) {
        const cdataEnd = textBeforeCursor.lastIndexOf(']]>');
        if (cdataEnd < cdataStart) {
            return true;
        }
    }
    
    // Check for unclosed comment
    const commentStart = textBeforeCursor.lastIndexOf('<!--');
    if (commentStart !== -1) {
        const commentEnd = textBeforeCursor.lastIndexOf('-->');
        if (commentEnd < commentStart) {
            return true;
        }
    }
    
    return false;
}

/**
 * Find if cursor is inside an epsilon tag context
 * @param textBeforeCursor - Text before cursor position
 * @param fullText - Full document text
 * @returns Tag name if found, null otherwise
 */
function findNearestEpsilonTagContext(textBeforeCursor: string, fullText: string): string | null {
    // Check for partial epsilon tag that might be in progress
    const partialTagRegex = /<((?:ε|epsilon)[a-zA-Z0-9_:.-]*)(?:\s+[^>]*)?$/;
    const partialMatch = partialTagRegex.exec(textBeforeCursor);
    
    if (partialMatch) {
        return partialMatch[1];
    }
    
    // XML namespace handling - check if we're in a namespace context
    const nsRegex = /<([a-zA-Z0-9_.-]+:(?:ε|epsilon)[a-zA-Z0-9_:.-]*)(?:\s+[^>]*)?$/;
    const nsMatch = nsRegex.exec(textBeforeCursor);
    
    if (nsMatch) {
        return nsMatch[1];
    }
    
    return null;
}

export function deactivate() {}