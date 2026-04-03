-- Rename MediumCredential → HashnodeCredential
ALTER TABLE "MediumCredential" RENAME TO "HashnodeCredential";
ALTER TABLE "HashnodeCredential" RENAME COLUMN "authorId" TO "publicationId";
ALTER INDEX "MediumCredential_userId_key" RENAME TO "HashnodeCredential_userId_key";
ALTER TABLE "HashnodeCredential" RENAME CONSTRAINT "MediumCredential_pkey" TO "HashnodeCredential_pkey";

-- Rename MediumExport → HashnodeExport
ALTER TABLE "MediumExport" RENAME TO "HashnodeExport";
ALTER TABLE "HashnodeExport" RENAME COLUMN "mediumPostId" TO "hashnodePostId";
ALTER TABLE "HashnodeExport" RENAME COLUMN "mediumPostUrl" TO "hashnodePostUrl";
ALTER INDEX "MediumExport_projectId_nodeId_credentialId_key" RENAME TO "HashnodeExport_projectId_nodeId_credentialId_key";
ALTER TABLE "HashnodeExport" RENAME CONSTRAINT "MediumExport_pkey" TO "HashnodeExport_pkey";
ALTER TABLE "HashnodeExport" RENAME CONSTRAINT "MediumExport_projectId_fkey" TO "HashnodeExport_projectId_fkey";
ALTER TABLE "HashnodeExport" RENAME CONSTRAINT "MediumExport_credentialId_fkey" TO "HashnodeExport_credentialId_fkey";
