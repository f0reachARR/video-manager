import { Alert, Anchor, Badge, Breadcrumbs, Center, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "../../components/layout/ResourcePage";
import { ApiError } from "../../lib/api/client";
import { useRobot } from "../../features/robots/api/queries";
import { useTeam } from "../../features/teams/api/queries";
import { RobotImageManager } from "../../features/robot-images/components/RobotImageManager";

export const Route = createFileRoute("/robots/$robotId/images")({
  component: RobotImagesPage,
});

function RobotImagesPage() {
  const { robotId } = Route.useParams();
  const robot = useRobot(robotId);
  const team = useTeam(robot.data?.teamId);

  if (robot.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (robot.error || !robot.data) {
    return (
      <Alert color="red" m="md">
        {robot.error instanceof ApiError
          ? robot.error.body.message
          : (robot.error as Error)?.message ?? "ロボットが見つかりません"}
      </Alert>
    );
  }

  const r = robot.data;
  const teamName = team.data?.name ?? r.teamId;
  const descriptionParts = [`チーム: ${teamName}`];
  if (r.version) descriptionParts.push(`バージョン: ${r.version}`);
  return (
    <ResourcePage title={`${r.name} の画像`} description={descriptionParts.join(" / ")}>
      <Stack>
        <Breadcrumbs>
          <Anchor component={Link} to="/robots">
            ロボット一覧
          </Anchor>
          <Text>{r.name}</Text>
          <Text>画像</Text>
        </Breadcrumbs>
        <Group gap="xs">
          <Badge color="blue" variant="light">
            チーム: {teamName}
          </Badge>
          {r.version && (
            <Badge color="gray" variant="light">
              {r.version}
            </Badge>
          )}
        </Group>
        <Title order={4}>写真 (時系列順)</Title>
        <RobotImageManager robot={r} />
      </Stack>
    </ResourcePage>
  );
}
