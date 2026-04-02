-- CreateTable: MediumCredential
CREATE TABLE "MediumCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "integrationToken" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediumCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediumCredential_userId_key" ON "MediumCredential"("userId");

-- CreateTable: MediumExport
CREATE TABLE "MediumExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "mediumPostId" TEXT NOT NULL,
    "mediumPostUrl" TEXT NOT NULL,
    "publishStatus" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "credentialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediumExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediumExport_projectId_nodeId_credentialId_key" ON "MediumExport"("projectId", "nodeId", "credentialId");

-- AddForeignKey: MediumExport -> Project
ALTER TABLE "MediumExport" ADD CONSTRAINT "MediumExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: MediumExport -> MediumCredential
ALTER TABLE "MediumExport" ADD CONSTRAINT "MediumExport_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "MediumCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
