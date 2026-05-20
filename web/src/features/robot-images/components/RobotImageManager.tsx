import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Group,
  Image,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { Dropzone, type FileWithPath, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { useState } from "react";

import {
  ApiError,
  robotImagesApi,
  type Robot,
  type RobotImage,
} from "../../../lib/api/client";
import {
  useDeleteRobotImage,
  useRobotImages,
  useSetPrimaryRobotImage,
  useUpdateRobotImage,
  useUploadRobotImages,
} from "../api/queries";

import "@mantine/dropzone/styles.css";

// HEIC isn't part of IMAGE_MIME_TYPE — append it so iPhone uploads work.
const ACCEPTED = [...IMAGE_MIME_TYPE, "image/heic", "image/heif"];

export function RobotImageManager({ robot }: { robot: Robot }) {
  const images = useRobotImages(robot.id);
  const upload = useUploadRobotImages(robot.id);
  const [uploadErrors, setUploadErrors] = useState<{ filename: string; error: string }[]>([]);

  const handleDrop = (files: FileWithPath[]) => {
    setUploadErrors([]);
    upload.mutate(
      { files },
      {
        onSuccess: (resp) => {
          const errs = resp.data.flatMap((r) =>
            r.error ? [{ filename: r.filename, error: r.error }] : [],
          );
          setUploadErrors(errs);
        },
      },
    );
  };

  const data = images.data?.data ?? [];

  return (
    <Stack>
      <Dropzone
        onDrop={handleDrop}
        accept={ACCEPTED}
        maxSize={30 * 1024 * 1024}
        loading={upload.isPending}
        multiple
      >
        <Group justify="center" gap="md" mih={80}>
          <Text size="sm">写真をドラッグ&ドロップ、またはクリックして選択 (複数可)</Text>
        </Group>
      </Dropzone>

      {uploadErrors.length > 0 && (
        <Alert color="orange" title={`${uploadErrors.length} 件のファイルが失敗しました`}>
          <Stack gap={4}>
            {uploadErrors.map((e, i) => (
              <Text key={i} size="xs">
                {e.filename}: {e.error}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {images.error && (
        <Alert color="red">
          {images.error instanceof ApiError
            ? images.error.body.message
            : (images.error as Error).message}
        </Alert>
      )}

      {images.isLoading ? (
        <Loader size="sm" />
      ) : data.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          まだ画像が登録されていません
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
          {data.map((img) => (
            <ImageCard
              key={img.id}
              robotId={robot.id}
              img={img}
              isPrimary={robot.primaryImageId === img.id}
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

function ImageCard({
  robotId,
  img,
  isPrimary,
}: {
  robotId: string;
  img: RobotImage;
  isPrimary: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const update = useUpdateRobotImage(robotId);
  const del = useDeleteRobotImage(robotId);
  const setPrimary = useSetPrimaryRobotImage(robotId);

  const captured = img.capturedAt ? new Date(img.capturedAt) : null;

  return (
    <>
      <Box
        style={{ cursor: "pointer", position: "relative" }}
        onClick={() => setOpened(true)}
      >
        <Image
          src={robotImagesApi.thumbUrl(img.id)}
          alt={img.caption || "robot image"}
          radius="sm"
          fit="cover"
          h={160}
          loading="lazy"
        />
        {isPrimary && (
          <Badge
            size="xs"
            color="yellow"
            style={{ position: "absolute", top: 4, left: 4 }}
          >
            ★ primary
          </Badge>
        )}
        <Text size="xs" c="dimmed" mt={4}>
          {captured ? captured.toLocaleString() : "撮影日時不明"}
        </Text>
        {img.caption && (
          <Text size="xs" lineClamp={1}>
            {img.caption}
          </Text>
        )}
      </Box>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        size="lg"
        title="画像詳細"
      >
        <Stack>
          <Image src={robotImagesApi.rawUrl(img.id)} alt={img.caption} fit="contain" mah="60vh" />
          <DateTimePicker
            label="撮影日時 (EXIF / 手動)"
            value={captured}
            onChange={(v) =>
              update.mutate({
                id: img.id,
                body: { capturedAt: v ? new Date(v).toISOString() : null },
              })
            }
            clearable
            withSeconds
          />
          <Textarea
            label="キャプション"
            value={img.caption}
            autosize
            minRows={1}
            onChange={(e) =>
              update.mutate({ id: img.id, body: { caption: e.currentTarget.value } })
            }
          />
          <Group justify="space-between">
            <ActionIcon
              variant={isPrimary ? "filled" : "light"}
              color="yellow"
              onClick={() => setPrimary.mutate(isPrimary ? null : img.id)}
              loading={setPrimary.isPending}
              aria-label="primary に設定"
              title={isPrimary ? "primary を解除" : "primary に設定"}
            >
              ★
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              loading={del.isPending}
              onClick={() => {
                if (confirm("削除しますか？")) {
                  del.mutate(img.id, { onSuccess: () => setOpened(false) });
                }
              }}
              aria-label="削除"
            >
              🗑️
            </ActionIcon>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
