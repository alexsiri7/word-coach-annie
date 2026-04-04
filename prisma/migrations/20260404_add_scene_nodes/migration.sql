-- Create SceneNode table for ordered paragraph/beat nodes within a scene
CREATE TABLE "SceneNode" (
  "id"         TEXT NOT NULL,
  "nodeId"     TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "content"    TEXT NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SceneNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SceneNode_nodeId_orderIndex_idx" ON "SceneNode"("nodeId", "orderIndex");

ALTER TABLE "SceneNode" ADD CONSTRAINT "SceneNode_nodeId_fkey"
  FOREIGN KEY ("nodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
