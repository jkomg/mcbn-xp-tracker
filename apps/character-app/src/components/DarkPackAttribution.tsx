import { Anchor, Group, Image, Text } from "@mantine/core"
import darkPackLogo from "../resources/darkpack_logo.png"

const DarkPackAttribution = () => (
    <Group
        gap="xs"
        align="center"
        wrap="nowrap"
        px="sm"
        style={{
            height: "100%",
            background: "rgba(0,0,0,0.82)",
            borderTop: "1px solid rgba(255,255,255,0.07)"
        }}
    >
        <Image src={darkPackLogo} h={28} w="auto" style={{ flexShrink: 0 }} />
        <Text size="10px" c="dimmed" style={{ lineHeight: 1.35 }}>
            Portions of the materials are the copyrights and trademarks of Paradox Interactive AB,
            and are used with permission. All rights reserved. For more information please visit{" "}
            <Anchor
                href="https://worldofdarkness.com"
                target="_blank"
                rel="noopener noreferrer"
                size="10px"
                c="dimmed"
                style={{ textDecoration: "underline" }}
            >
                worldofdarkness.com
            </Anchor>
            {". "}
            MCBN is not official World of Darkness material and is not endorsed by Paradox
            Interactive AB.
        </Text>
    </Group>
)

export default DarkPackAttribution
