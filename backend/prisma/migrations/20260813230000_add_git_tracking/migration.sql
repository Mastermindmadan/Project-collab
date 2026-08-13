-- AddColumn
ALTER TABLE "Project" ADD COLUMN "lastGitSync" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GitCommit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorEmail" TEXT,
    "commitUrl" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "additions" INTEGER,
    "deletions" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCommitLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "commitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommitLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitCommit_sha_key" ON "GitCommit"("sha");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommitLink_taskId_commitId_key" ON "TaskCommitLink"("taskId", "commitId");

-- CreateIndex
CREATE INDEX "GitCommit_projectId_committedAt_idx" ON "GitCommit"("projectId", "committedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_projectId_createdAt_idx" ON "ActivityEvent"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "GitCommit" ADD CONSTRAINT "GitCommit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommitLink" ADD CONSTRAINT "TaskCommitLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommitLink" ADD CONSTRAINT "TaskCommitLink_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "GitCommit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
