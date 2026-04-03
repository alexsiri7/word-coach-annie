-- CreateTable: MediumCredential
CREATE TABLE "MediumCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integrationToken" TEXT NOT NULL,
    "authorId" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediumCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MediumExport
CREATE TABLE "MediumExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "mediumPostId" TEXT NOT NULL,
    "mediumPostUrl" TEXT NOT NULL,
    "publishStatus" TEXT NOT NULL DEFAULT 'draft',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediumExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediumCredential_userId_key" ON "MediumCredential"("userId");

-- CreateIndex
CREATE INDEX "MediumExport_projectId_idx" ON "MediumExport"("projectId");

-- CreateIndex
CREATE INDEX "MediumExport_nodeId_idx" ON "MediumExport"("nodeId");

-- AddForeignKey
ALTER TABLE "MediumCredential" ADD CONSTRAINT "MediumCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediumExport" ADD CONSTRAINT "MediumExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
