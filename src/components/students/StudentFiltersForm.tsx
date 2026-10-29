import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import toolbar from "@/components/ui/Toolbar.module.css";
import { LEVELS, LEVEL_LABELS } from "@/lib/students/labels";
import type { StudentFilters } from "@/lib/students/queries";

type Option = { id: string; name: string };

// GET form: filters live in the URL so results can be reloaded and shared.
export function StudentFiltersForm({
  filters,
  lessonTypes,
  teachers,
}: {
  filters: StudentFilters;
  lessonTypes: Option[];
  teachers?: Option[];
}) {
  return (
    <form className={toolbar.toolbar} role="search" aria-label="חיפוש וסינון תלמידים">
      <div className={toolbar.search}>
        <label htmlFor="student-search" className="visually-hidden">
          חיפוש תלמיד לפי שם
        </label>
        <input id="student-search" name="q" type="search" placeholder="חיפוש תלמיד..." defaultValue={filters.q} />
        <Search size={18} aria-hidden="true" />
      </div>
      <SelectField
        label="סטטוס"
        hideLabel
        name="status"
        defaultValue={filters.status}
        options={[
          { value: "", label: "כל הסטטוסים" },
          { value: "active", label: "פעיל" },
          { value: "inactive", label: "לא פעיל" },
        ]}
      />
      <SelectField
        label="תחום"
        hideLabel
        name="subject"
        defaultValue={filters.subject}
        options={[{ value: "", label: "כל התחומים" }, ...lessonTypes.map((lt) => ({ value: lt.id, label: lt.name }))]}
      />
      <SelectField
        label="רמה"
        hideLabel
        name="level"
        defaultValue={filters.level}
        options={[{ value: "", label: "כל הרמות" }, ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))]}
      />
      {teachers && (
        <SelectField
          label="מורה"
          hideLabel
          name="teacher"
          defaultValue={filters.teacher}
          options={[{ value: "", label: "כל המורים" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]}
        />
      )}
      <Button type="submit" variant="outline">
        סינון
      </Button>
    </form>
  );
}
