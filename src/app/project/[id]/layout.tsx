import type { Metadata } from "next";
import { ProjectsController } from "@/lib/controllers/projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await ProjectsController.getProject(id);
    return {
      title: project.title,
      openGraph: {
        title: `${project.title} | Word Coach Annie`,
        description: project.synopsis || "A writing project in Word Coach Annie",
      },
    };
  } catch {
    return { title: "Project" };
  }
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
