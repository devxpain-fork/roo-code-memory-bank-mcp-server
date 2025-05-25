#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import fs from 'fs/promises'; // Use promises for async operations
import path from 'path';
import { logger } from './logger.js';
import { BASE_PATH } from './utils/path.js';

// --- Constants ---
const MEMORY_BANK_DIR_NAME = "memory-bank";
const MEMORY_BANK_PATH = path.join(BASE_PATH, MEMORY_BANK_DIR_NAME);

const INITIAL_FILES: { [key: string]: string } = {
  "productContext.md": `# Product Context\n\nThis file provides a high-level overview...\n\n*`,
  "activeContext.md": `# Active Context\n\nThis file tracks the project's current status...\n\n*`,
  "progress.md": `# Progress\n\nThis file tracks the project's progress...\n\n*`,
  "decisionLog.md": `# Decision Log\n\nThis file records architectural and implementation decisions...\n\n*`,
  "systemPatterns.md": `# System Patterns *Optional*\n\nThis file documents recurring patterns...\n\n*`
};

// --- Helper Functions ---

function getCurrentTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureMemoryBankDir(): Promise<void> {
  try {
    await fs.access(MEMORY_BANK_PATH);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(MEMORY_BANK_PATH, { recursive: true });
    console.error(chalk.green(`Created memory bank directory: ${MEMORY_BANK_PATH}`));
  }
}

// --- Tool Definitions ---

const INITIALIZE_MEMORY_BANK_TOOL: Tool = {
  name: "initialize_memory_bank",
  description: "Creates the memory-bank directory and standard .md files with initial templates.",
  inputSchema: {
    type: "object",
    properties: {
      project_brief_content: {
        type: "string",
        description: "(Optional) Content from projectBrief.md to pre-fill productContext.md"
      }
    },
    required: []
  }
  // Output: Confirmation message (handled in implementation)
};

const CHECK_MEMORY_BANK_STATUS_TOOL: Tool = {
  name: "check_memory_bank_status",
  description: "Checks if the memory-bank directory exists and lists the .md files within it.",
  inputSchema: { type: "object", properties: {} } // No input needed
  // Output: { exists: boolean, files: string[] } (handled in implementation)
};

const READ_MEMORY_BANK_FILE_TOOL: Tool = {
  name: "read_memory_bank_file",
  description: "Reads the full content of a specified memory bank file.",
  inputSchema: {
    type: "object",
    properties: {
      file_name: {
        type: "string",
        description: "The name of the memory bank file (e.g., 'productContext.md')"
      }
    },
    required: ["file_name"]
  }
  // Output: { content: string } (handled in implementation)
};

const APPEND_MEMORY_BANK_ENTRY_TOOL: Tool = {
  name: "append_memory_bank_entry",
  description: "Appends a new, timestamped entry to a specified file, optionally under a specific markdown header.",
  inputSchema: {
    type: "object",
    properties: {
      file_name: {
        type: "string",
        description: "The name of the memory bank file to append to."
      },
      entry: {
        type: "string",
        description: "The content of the entry to append."
      },
      section_header: {
        type: "string",
        description: "(Optional) The exact markdown header (e.g., '## Decision') to append under."
      }
    },
    required: ["file_name", "entry"]
  }
  // Output: Confirmation message (handled in implementation)
};

const ALL_TOOLS = [
  INITIALIZE_MEMORY_BANK_TOOL,
  CHECK_MEMORY_BANK_STATUS_TOOL,
  READ_MEMORY_BANK_FILE_TOOL,
  APPEND_MEMORY_BANK_ENTRY_TOOL
];

// --- Server Logic ---

class RooMemoryBankServer {

  async initializeMemoryBank(input: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      await ensureMemoryBankDir();
      let initializationMessages: string[] = [];

      for (const [fileName, template] of Object.entries(INITIAL_FILES)) {
        const filePath = path.join(MEMORY_BANK_PATH, fileName);
        try {
          await fs.access(filePath);
          initializationMessages.push(`File ${fileName} already exists.`);
        } catch {
          // File doesn't exist, create it
          let content = template;
          // Add timestamp to initial content
          content = content.replace('YYYY-MM-DD HH:MM:SS', getCurrentTimestamp());

          // Special handling for project brief in productContext.md
          if (fileName === "productContext.md" && input?.project_brief_content) {
             content = content.replace('...', `based on project brief:\n\n${input.project_brief_content}\n\n...`);
          }

          await fs.writeFile(filePath, content);
          initializationMessages.push(`Created file: ${fileName}`);
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ status: "success", messages: initializationMessages }, null, 2) }] };
    } catch (error: any) {
      console.error(chalk.red("Error initializing memory bank:"), error);
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: error.message }, null, 2) }], isError: true };
    }
  }

  async checkMemoryBankStatus(): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     try {
        await fs.access(MEMORY_BANK_PATH);
        const files = await fs.readdir(MEMORY_BANK_PATH);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        return { content: [{ type: "text", text: JSON.stringify({ exists: true, files: mdFiles }, null, 2) }] };
     } catch (error) {
        // If access fails, directory likely doesn't exist
        return { content: [{ type: "text", text: JSON.stringify({ exists: false, files: [] }, null, 2) }] };
     }
  }

  async readMemoryBankFile(input: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const fileName = input?.file_name;
    if (!fileName || typeof fileName !== 'string') {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Missing or invalid 'file_name' parameter." }, null, 2) }], isError: true };
    }
    const filePath = path.join(MEMORY_BANK_PATH, fileName);
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return { content: [{ type: "text", text: JSON.stringify({ content: fileContent }, null, 2) }] };
    } catch (error: any) {
      console.error(chalk.red(`Error reading file ${fileName}:`), error);
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Failed to read file ${fileName}: ${error.message}` }, null, 2) }], isError: true };
    }
  }

  async appendMemoryBankEntry(input: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     const { file_name: fileName, entry, section_header: sectionHeader } = input;

     if (!fileName || typeof fileName !== 'string') {
       return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Missing or invalid 'file_name' parameter." }, null, 2) }], isError: true };
     }
     if (!entry || typeof entry !== 'string') {
       return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Missing or invalid 'entry' parameter." }, null, 2) }], isError: true };
     }

     const filePath = path.join(MEMORY_BANK_PATH, fileName);
     const timestamp = getCurrentTimestamp();
     const formattedEntry = `\n[${timestamp}] - ${entry}\n`;

     try {
       await ensureMemoryBankDir(); // Ensure directory exists before appending

       if (sectionHeader && typeof sectionHeader === 'string') {
         let fileContent = "";
         try {
            fileContent = await fs.readFile(filePath, 'utf-8');
         } catch (readError: any) {
             if (readError.code === 'ENOENT') { // File doesn't exist, create it
                 console.warn(chalk.yellow(`File ${fileName} not found, creating.`));
                 // Use initial template if available, otherwise just the header and entry
                 const initialTemplate = INITIAL_FILES[fileName] ? INITIAL_FILES[fileName].replace('YYYY-MM-DD HH:MM:SS', timestamp) : '';
                 fileContent = initialTemplate;
             } else {
                 throw readError; // Re-throw other read errors
             }
         }


         const headerIndex = fileContent.indexOf(sectionHeader);
         if (headerIndex !== -1) {
           // Find the end of the section (next header or end of file)
           const nextHeaderIndex = fileContent.indexOf('\n##', headerIndex + sectionHeader.length);
           const insertIndex = (nextHeaderIndex !== -1) ? nextHeaderIndex : fileContent.length;
           const updatedContent = fileContent.slice(0, insertIndex).trimEnd() + '\n' + formattedEntry.trimStart() + fileContent.slice(insertIndex);
           await fs.writeFile(filePath, updatedContent);
         } else {
           // Header not found, append to the end with the header
           console.warn(chalk.yellow(`Header "${sectionHeader}" not found in ${fileName}. Appending header and entry to the end.`));
           await fs.appendFile(filePath, `\n${sectionHeader}\n${formattedEntry}`);
         }
       } else {
         // No section header, just append to the end
         await fs.appendFile(filePath, formattedEntry);
       }

       return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: `Appended entry to ${fileName}` }, null, 2) }] };
     } catch (error: any) {
       console.error(chalk.red(`Error appending to file ${fileName}:`), error);
       return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Failed to append to file ${fileName}: ${error.message}` }, null, 2) }], isError: true };
     }
   }
}


// --- Server Setup ---
const server = new Server(
  {
    name: "roo-memory-bank-mcp-server",
    version: "0.1.0", // Initial version
  },
  {
    capabilities: {
      tools: {}, // Tools are dynamically listed
    },
  }
);

const memoryBankServer = new RooMemoryBankServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  console.error(chalk.blue(`Received call for tool: ${toolName}`));
  // console.error(chalk.gray(`Arguments: ${JSON.stringify(args)}`)); // Optional: Log arguments

  switch (toolName) {
    case "initialize_memory_bank":
      return memoryBankServer.initializeMemoryBank(args);
    case "check_memory_bank_status":
      return memoryBankServer.checkMemoryBankStatus();
    case "read_memory_bank_file":
      return memoryBankServer.readMemoryBankFile(args);
    case "append_memory_bank_entry":
      return memoryBankServer.appendMemoryBankEntry(args);
    default:
      console.error(chalk.red(`Unknown tool requested: ${toolName}`));
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Unknown tool: ${toolName}` }, null, 2) }],
        isError: true
      };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(chalk.green("Roo Memory Bank MCP Server running on stdio"));

  // Log environment and process details at startup
  logger.info('--- Server Initialization Details ---');
  logger.logProcessDetails();
  logger.logEnvironment();
  logger.info(`Current BASE_PATH: ${BASE_PATH}`);
  logger.info(`Memory Bank Path: ${MEMORY_BANK_PATH}`);
  logger.info('Roo Memory Bank MCP Server initialized.');
}

runServer().catch((error) => {
  console.error(chalk.red("Fatal error running server:"), error);
  process.exit(1);
});
