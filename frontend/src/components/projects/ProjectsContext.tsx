import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import { listProjects, type Project } from "./projectsApi";

type ProjectsValue = {
  /** null while the first load is in flight. */
  projects: Project[] | null;
  reload: () => Promise<void>;
};

const ProjectsContext = createContext<ProjectsValue>({ projects: null, reload: async () => {} });

/**
 * One list for the whole shell: the sidebar shows it twice (desktop and the
 * phone drawer) and the dashboard manages it, so it is loaded once here and
 * kept fresh over the socket.
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch {
      // The sidebar simply shows no projects; the pages report their own errors.
      setProjects((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSocketEvent("projects:changed", () => void reload());
  // A map uploaded or deleted changes the counts too.
  useSocketEvent("maps:changed", () => void reload());
  useOnReconnect(() => void reload());

  return <ProjectsContext.Provider value={{ projects, reload }}>{children}</ProjectsContext.Provider>;
}

export const useProjects = () => useContext(ProjectsContext);
