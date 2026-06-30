import { Database } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Explains that group data lives in a per-computer local SQLite database and is
 * not shared with a hosted preview or other reps' machines. Surfaced on the
 * Import and Groups pages, where "where did my data go?" confusion happens.
 */
export function LocalDataNotice() {
  return (
    <Alert>
      <Database className="h-4 w-4" />
      <AlertTitle>Where your group data lives</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Groups you import or sync on localhost are stored in the local SQLite database on{" "}
            <strong>this computer</strong>.
          </li>
          <li>The hosted / OpenHost preview does not share that local database.</li>
          <li>
            To move data, export and re-import groups (CSV/JSON), or build a cloud backend later.
          </li>
          <li>Reps on other computers keep their own local data until team/cloud sync is built.</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
