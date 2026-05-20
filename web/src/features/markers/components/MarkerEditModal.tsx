import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useForm } from "@tanstack/react-form";

import type { MarkerCategory } from "../../../lib/api/client";
import { markerCategories } from "../api/queries";
import { markerCategoryLabel } from "../lib/category";

export type MarkerPayload = {
  runOffsetSec: number;
  label: string;
  category: MarkerCategory;
};

export function MarkerEditModal({
  mode,
  initial,
  durationSec,
  onClose,
  onSubmit,
  saving,
}: {
  mode: "create" | "edit";
  initial: MarkerPayload;
  durationSec: number;
  onClose: () => void;
  onSubmit: (body: MarkerPayload) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      onSubmit({
        runOffsetSec: Math.max(0, Math.round(value.runOffsetSec)),
        label: value.label,
        category: value.category,
      });
    },
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={mode === "create" ? "Marker 追加" : "Marker 編集"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Stack>
          <form.Field name="runOffsetSec">
            {(field) => (
              <NumberInput
                label="位置 (秒、Run 開始から)"
                value={field.state.value}
                min={0}
                max={durationSec > 0 ? durationSec : undefined}
                onChange={(v) =>
                  field.handleChange(typeof v === "number" ? v : 0)
                }
              />
            )}
          </form.Field>
          <form.Field name="category">
            {(field) => (
              <Select
                label="Category"
                data={markerCategories.map((c) => ({
                  value: c,
                  label: markerCategoryLabel[c],
                }))}
                value={field.state.value}
                onChange={(v) => v && field.handleChange(v as MarkerCategory)}
              />
            )}
          </form.Field>
          <form.Field name="label">
            {(field) => (
              <TextInput
                label="Label"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                placeholder="例: 脱輪 / 完璧"
              />
            )}
          </form.Field>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "create" ? "追加" : "保存"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
