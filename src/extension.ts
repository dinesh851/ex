import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('XML Helper extension activated');

    // Get configuration
    const config = vscode.workspace.getConfiguration('xmlHelper');
    let customTemplates = config.get<{name: string, content: string}[]>('templates', []);

    // Register close tag command
    const closeTagDisposable = vscode.commands.registerCommand('xmlHelper.closeCurrentTag', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const fullText = document.getText();
        const cursorPos = document.offsetAt(position);

        // Find all tags in the document
        // FIXED: Added underscore character to the allowed tag name characters
        const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s+[^>]*?)?>/g;
        
        const stack: {name: string, pos: number}[] = [];
        const allTags: {name: string, pos: number, isClosing: boolean, isSelfClosing: boolean}[] = [];
        
        // First pass: collect all tags and their positions
        let match;
        tagRegex.lastIndex = 0; // Reset regex lastIndex
        while ((match = tagRegex.exec(fullText)) !== null) {
            const isClosing = match[1] === '/';
            const isSelfClosing = !isClosing && match[0].endsWith('/>');
            allTags.push({
                name: match[2],
                pos: match.index,
                isClosing,
                isSelfClosing
            });
        }

        // Second pass: determine which tags are unclosed at cursor position
        const tagsBeforeCursor = allTags.filter(tag => tag.pos < cursorPos);
        const tagsAfterCursor = allTags.filter(tag => tag.pos >= cursorPos);
        
        // Build the stack of unclosed tags before cursor
        for (const tag of tagsBeforeCursor) {
            if (tag.isSelfClosing) {
                continue; // Skip self-closing tags
            }

            if (tag.isClosing) {
                // For closing tags, find matching opening tag in stack
                let matchingIndex = -1;
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].name === tag.name) {
                        matchingIndex = i;
                        break;
                    }
                }
                if (matchingIndex >= 0) {
                    stack.splice(matchingIndex, 1);
                }
            } else {
                // For opening tags, add to stack
                stack.push({name: tag.name, pos: tag.pos});
            }
        }

        // Check if cursor is inside a closing tag
        const lineText = document.lineAt(position.line).text;
        const cursorPosInLine = position.character;
        const textBeforeCursor = lineText.substring(0, cursorPosInLine);
        // FIXED: Added underscore character to the allowed tag name characters
        if (/<\/([a-zA-Z][a-zA-Z0-9:_-]*)$/.test(textBeforeCursor)) {
            vscode.window.showInformationMessage('Cursor is inside a closing tag');
            return;
        }

        // If we have no unclosed tags, nothing to do
        if (stack.length === 0) {
            vscode.window.showInformationMessage('No unclosed tags found');
            return;
        }

        // Find the first tag we need to close by working backward from the most recently opened tag
        let tagToClose: string | null = null;
        
        for (let i = stack.length - 1; i >= 0; i--) {
            const tag = stack[i];
            const tagName = tag.name;
            
            // Check if this tag is already properly closed after cursor
            let isProperlyClosed = false;
            let nestedTagsToClose = 0;
            
            for (const t of tagsAfterCursor) {
                if (!t.isClosing && t.name === tagName && !t.isSelfClosing) {
                    nestedTagsToClose++;
                    continue;
                }
                
                if (t.isClosing && t.name === tagName) {
                    if (nestedTagsToClose > 0) {
                        nestedTagsToClose--;
                    } else {
                        isProperlyClosed = true;
                        break;
                    }
                }
            }
            
            if (!isProperlyClosed) {
                tagToClose = tagName;
                break;
            }
        }

        // If we've exhausted the stack and didn't find a tag to close,
        // it means all tags are properly closed
        if (!tagToClose) {
            vscode.window.showInformationMessage('All tags are properly closed');
            return;
        }

        // Insert closing tag
        const closingTag = `</${tagToClose}>`;
        editor.edit(editBuilder => {
            editBuilder.insert(position, closingTag);
        });
        
        vscode.window.showInformationMessage(`Closed tag: <${tagToClose}>`);
    });

    // Register the command to close all unclosed tags
    const closeAllTagsDisposable = vscode.commands.registerCommand('xmlHelper.closeAllTags', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const fullText = document.getText();
        const cursorPos = document.offsetAt(position);

        // Find all tags in the document
        // FIXED: Added underscore character to the allowed tag name characters
        const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s+[^>]*?)?>/g;
        
        const stack: {name: string, pos: number}[] = [];
        const allTags: {name: string, pos: number, isClosing: boolean, isSelfClosing: boolean}[] = [];
        
        // First pass: collect all tags and their positions
        let match;
        tagRegex.lastIndex = 0; // Reset regex lastIndex
        while ((match = tagRegex.exec(fullText)) !== null) {
            const isClosing = match[1] === '/';
            const isSelfClosing = !isClosing && match[0].endsWith('/>');
            allTags.push({
                name: match[2],
                pos: match.index,
                isClosing,
                isSelfClosing
            });
        }

        // Second pass: determine which tags are unclosed at cursor position
        const tagsBeforeCursor = allTags.filter(tag => tag.pos < cursorPos);
        
        // Build the stack of unclosed tags before cursor
        for (const tag of tagsBeforeCursor) {
            if (tag.isSelfClosing) {
                continue; // Skip self-closing tags
            }

            if (tag.isClosing) {
                // For closing tags, find matching opening tag in stack
                let matchingIndex = -1;
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].name === tag.name) {
                        matchingIndex = i;
                        break;
                    }
                }
                if (matchingIndex >= 0) {
                    stack.splice(matchingIndex, 1);
                }
            } else {
                // For opening tags, add to stack
                stack.push({name: tag.name, pos: tag.pos});
            }
        }

        // Check if cursor is inside a closing tag
        const lineText = document.lineAt(position.line).text;
        const cursorPosInLine = position.character;
        const textBeforeCursor = lineText.substring(0, cursorPosInLine);
        // FIXED: Added underscore character to the allowed tag name characters
        if (/<\/([a-zA-Z][a-zA-Z0-9:_-]*)$/.test(textBeforeCursor)) {
            vscode.window.showInformationMessage('Cursor is inside a closing tag');
            return;
        }

        // If we have no unclosed tags, nothing to do
        if (stack.length === 0) {
            vscode.window.showInformationMessage('No unclosed tags found');
            return;
        }

        // Build the closing tags string, starting from the most recently opened tag
        let closingTagsString = '';
        for (let i = stack.length - 1; i >= 0; i--) {
            closingTagsString += `</${stack[i].name}>`;
        }

        // Insert all closing tags
        editor.edit(editBuilder => {
            editBuilder.insert(position, closingTagsString);
        });
        
        vscode.window.showInformationMessage(`Closed ${stack.length} tags`);
    });

    // Register format XML command
    const formatXmlDisposable = vscode.commands.registerCommand('xmlHelper.formatXml', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        try {
            const document = editor.document;
            const text = document.getText();
            
            // Simple XML formatting function
            const formatted = formatXml(text);
            
            // Replace the entire document with formatted XML
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            
            editor.edit(editBuilder => {
                editBuilder.replace(fullRange, formatted);
            });
            
            vscode.window.showInformationMessage('XML formatted successfully');
        }  catch (e) {
            if (e instanceof Error) {
                vscode.window.showErrorMessage(`Error formatting XML: ${e.message}`);
            } else {
                vscode.window.showErrorMessage(`Unknown error formatting XML`);
            }
        }
    });

    // Format XML helper function
    function formatXml(xml: string): string {
        let formatted = '';
        let indent = '';
        const tab = '    '; // 4 spaces for indentation
        let lastOpenTag = '';
        let inOpenTag = false;
        
        xml = xml.replace(/(>)(<)(\/*)/g, '$1\n$2$3'); // Add line breaks
        
        xml.split('\n').forEach(line => {
            line = line.trim();
            if (!line) return;
            
            // Handle comments
            if (line.startsWith('<!--')) {
                if (line.endsWith('-->')) {
                    formatted += indent + line + '\n';
                } else {
                    formatted += indent + line;
                }
                return;
            }
            
            if (line.startsWith('</')) {
                // Closing tag
                indent = indent.substring(tab.length);
                formatted += indent + line + '\n';
            } else if (line.startsWith('<') && !line.endsWith('/>') && !line.endsWith('>')) {
                // Open tag that continues on next line
                inOpenTag = true;
                lastOpenTag = line;
                formatted += indent + line + '\n';
                indent += tab;
            } else if (inOpenTag && !line.startsWith('<') && !line.endsWith('>')) {
                // Content inside open tag that spans multiple lines
                formatted += indent + line + '\n';
            } else if (inOpenTag && line.endsWith('>')) {
                // End of open tag
                inOpenTag = false;
                formatted += indent + line + '\n';
            } else if (line.startsWith('<') && !line.endsWith('/>')) {
                // Normal open tag
                formatted += indent + line + '\n';
                indent += tab;
            } else if (line.startsWith('<') && line.endsWith('/>')) {
                // Self-closing tag
                formatted += indent + line + '\n';
            } else {
                // Content
                formatted += indent + line + '\n';
            }
        });
        
        return formatted;
    }

    // Register snippet commands
    const snippet1Disposable = vscode.commands.registerCommand('xmlHelper.insertSnippet1', () => {
        insertXmlSnippet('<example>');
    });

    const snippet2Disposable = vscode.commands.registerCommand('xmlHelper.insertSnippet2', () => {
        insertXmlSnippet('<template>\n\t<content>$1</content>\n</template>');
    });

    // Register custom template commands
    const insertTemplateDisposable = vscode.commands.registerCommand(
        'xmlHelper.insertCustomTemplate',
        async () => {
            if (customTemplates.length === 0) {
                const action = await vscode.window.showInformationMessage(
                    'No custom templates found. Would you like to add one?',
                    'Yes', 'No'
                );
                
                if (action === 'Yes') {
                    vscode.commands.executeCommand('xmlHelper.addCustomTemplate');
                }
                return;
            }

            const selected = await vscode.window.showQuickPick(
                customTemplates.map(t => t.name),
                { placeHolder: 'Select a template to insert' }
            );

            if (selected) {
                const template = customTemplates.find(t => t.name === selected);
                if (template) {
                    insertXmlSnippet(template.content);
                }
            }
        }
    );

    const addTemplateDisposable = vscode.commands.registerCommand(
        'xmlHelper.addCustomTemplate',
        async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter template name',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Template name cannot be empty';
                    }
                    if (customTemplates.some(t => t.name === value)) {
                        return 'Template with this name already exists';
                    }
                    return null;
                }
            });

            if (!name) { return; }

            const content = await vscode.window.showInputBox({
                prompt: 'Enter XML content (use $1, $2 for cursor positions)',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Content cannot be empty';
                    }
                    if (!value.includes('<') || !value.includes('>')) {
                        return 'Content must contain XML tags';
                    }
                    return null;
                }
            });

            if (!content) { return; }

            // Update configuration
            customTemplates = [...customTemplates, { name, content }];
            await config.update('templates', customTemplates, vscode.ConfigurationTarget.Global);
            
            vscode.window.showInformationMessage(`Template "${name}" added successfully`);
        }
    );

    // Add all disposables to context
    context.subscriptions.push(
        closeTagDisposable,
        closeAllTagsDisposable,
        formatXmlDisposable,
        snippet1Disposable,
        snippet2Disposable,
        insertTemplateDisposable,
        addTemplateDisposable
    );

    // Helper function to insert XML snippets
    function insertXmlSnippet(snippet: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.insertSnippet(new vscode.SnippetString(snippet));
        }
    }

    // Log activation in console for debugging purposes
    console.log('XML Helper extension is now fully activated and commands are registered');
    // Show a notification when the extension is activated
    vscode.window.showInformationMessage('XML Helper extension is activated');
}

export function deactivate() {
    console.log('XML Helper extension deactivated');
}