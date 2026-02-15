# Word Coach Annie

Word Coach Annie is an AI-powered writing assistant designed to help authors plan, draft, and visualize their stories. It features a Next.js web interface for managing project data and a Model Context Protocol (MCP) server for integration with AI assistants like Claude.

## Features

- **Project Management**: Create and organize writing projects.
- **Structure Editing**: Outline your story with parts, chapters, and scenes.
- **Story Bible**: Track characters, locations, and other world elements.
- **Rich Text Editor**: Write scene content with a WYSIWYG editor.
- **AI Integration**: Seamlessly connect with AI assistants via MCP for context-aware help.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- Node.js (optional, for local development outside Docker)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/word-coach-annie.git
    cd word-coach-annie
    ```

2.  **Start the application:**
    Run the following command to build and start the Docker container:
    ```bash
    docker compose up -d
    ```

3.  **Access the Web App:**
    Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

## MCP Server Configuration (for Claude Desktop)

To use Word Coach Annie with Claude Desktop, you need to configure the MCP server in your `claude_desktop_config.json`.

1.  Locate your config file:
    - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2.  Add the following configuration:

    ```json
    {
      "mcpServers": {
        "word-coach-annie": {
          "command": "docker",
          "args": [
            "compose",
            "exec",
            "-T",
            "app",
            "npx",
            "tsx",
            "src/mcp/index.ts"
          ]
        }
      }
    }
    ```

    > **Note:** The `-T` flag is crucial as it disables pseudo-tty allocation, ensuring clean stdio communication for the MCP protocol.

3.  Restart Claude Desktop. The "word-coach-annie" tools should now be available.

## Development

The project uses a Docker-based workflow.

- **Start Dev Server**: `docker compose up` (logs will stream to console)
- **Run Tests**: `docker compose exec app npm run test`
- **Database Studio**: `docker compose exec app npx prisma studio` (accessible at http://localhost:5555)
- **Database Migrations**: `docker compose exec app npx prisma migrate dev`

For more details on project rules and commands, see [docs/RULES.md](docs/RULES.md).
