-- AddColumn: credentialId to MediumExport
ALTER TABLE "MediumExport" ADD COLUMN "credentialId" TEXT;

-- AddColumn: updatedAt to MediumExport
ALTER TABLE "MediumExport" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: unique constraint on MediumExport
CREATE UNIQUE INDEX "MediumExport_projectId_nodeId_credentialId_key" ON "MediumExport"("projectId", "nodeId", "credentialId");

-- AddForeignKey: credentialId -> MediumCredential
ALTER TABLE "MediumExport" ADD CONSTRAINT "MediumExport_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "MediumCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
