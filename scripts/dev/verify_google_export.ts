
import { GoogleDocsExporter } from "./src/lib/export/google-docs-exporter";
import { GoogleAuthController } from "./src/lib/controllers/google-auth";

async function main() {
    console.log("Starting verification of Google Docs Export...");

    // 1. Check Auth Status (should be checking DB directly)
    try {
        const status = await GoogleAuthController.getStatus();
        console.log("Auth Status:", status);
    } catch (error) {
        console.error("Auth Status Check Failed:", error);
    }

    // 2. Try to export a non-existent project (should throw specific error)
    try {
        await GoogleDocsExporter.exportToGoogleDocs("non-existent-id", "STORY_READER");
    } catch (error: any) {
        if (error.message && error.message.includes("Project not found")) {
            console.log("Success: Correctly identified non-existent project.");
        } else {
            console.error("Unexpected error when exporting non-existent project:", error);
        }
    }

    console.log("Verification complete.");
}

main().catch(console.error);
