import { Anchor, Box, Burger, Button, Container, Group, Text } from "@mantine/core"
import { IconBrandDiscord, IconBook, IconLogout, IconUserCircle } from "@tabler/icons-react"
import { useAuth } from "~/hooks/useAuth"
import { globals } from "~/globals"

export type AppTopbarProps = {
    asideBar?: {
        show: boolean
        onToggle: () => void
    }
}

const NAV_MUTED = "#9898b0"
const NAV_HOVER = "#e0e0e0"

const AppTopbar = ({ asideBar }: AppTopbarProps) => {
    const smallScreen = globals.isSmallScreen
    const { user, isAuthenticated, signIn, signOut } = useAuth()

    const navLinkStyle = {
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: "0.88rem",
        color: NAV_MUTED,
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0.35rem 0.6rem",
        borderRadius: 4,
        transition: "color 0.15s, background 0.15s",
        whiteSpace: "nowrap" as const,
    }

    return (
        <Box
            h="100%"
            style={{
                backgroundImage: "linear-gradient(rgba(22,33,62,0.88), rgba(22,33,62,0.95)), url('/static/images/music.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderBottom: "1px solid rgba(139,0,0,0.5)",
            }}
        >
            <Container size="lg" py="xs" px="md" h="100%">
                <Group justify="space-between" align="center" h="100%" wrap="nowrap">
                    {/* Brand */}
                    <Anchor href="/" underline="never">
                        <Group gap={8} align="center" wrap="nowrap">
                            <img
                                src="/static/images/music.png"
                                alt="Music City by Night"
                                style={{ height: 28, width: "auto", borderRadius: 3, opacity: 0.9 }}
                            />
                            {!smallScreen && (
                                <Text
                                    style={{
                                        fontFamily: "Cinzel, Georgia, serif",
                                        fontSize: "0.95rem",
                                        letterSpacing: "0.06em",
                                        color: "#e0e0e0",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Music City by Night
                                </Text>
                            )}
                        </Group>
                    </Anchor>

                    <Group gap={4} align="center" wrap="nowrap">
                        {isAuthenticated && (
                            <>
                                {/* Display name */}
                                {!smallScreen && user?.display_name && (
                                    <Text size="sm" style={{ color: NAV_MUTED, paddingRight: 4 }}>
                                        {user.display_name}
                                    </Text>
                                )}

                                {/* Player Portal */}
                                <Anchor
                                    href="/player"
                                    underline="never"
                                    style={navLinkStyle}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = NAV_HOVER
                                        e.currentTarget.style.background = "rgba(255,255,255,0.06)"
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = NAV_MUTED
                                        e.currentTarget.style.background = "transparent"
                                    }}
                                >
                                    <IconUserCircle size={15} />
                                    My XP
                                </Anchor>

                                {/* Wiki */}
                                <Anchor
                                    href="/wiki/"
                                    underline="never"
                                    style={navLinkStyle}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = NAV_HOVER
                                        e.currentTarget.style.background = "rgba(255,255,255,0.06)"
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = NAV_MUTED
                                        e.currentTarget.style.background = "transparent"
                                    }}
                                >
                                    <IconBook size={15} />
                                    Wiki
                                </Anchor>

                                {/* Sign out */}
                                <Anchor
                                    component="button"
                                    underline="never"
                                    onClick={signOut}
                                    style={navLinkStyle}
                                    title="Sign out"
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = NAV_HOVER
                                        e.currentTarget.style.background = "rgba(255,255,255,0.06)"
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = NAV_MUTED
                                        e.currentTarget.style.background = "transparent"
                                    }}
                                >
                                    <IconLogout size={15} />
                                    {!smallScreen && "Sign out"}
                                </Anchor>
                            </>
                        )}

                        {!isAuthenticated && (
                            <Button
                                size="xs"
                                variant="outline"
                                color="gray"
                                leftSection={<IconBrandDiscord size={14} />}
                                onClick={signIn}
                            >
                                Sign in with Discord
                            </Button>
                        )}

                        {/* Aside bar toggle on mobile */}
                        {asideBar && smallScreen && (
                            <Burger
                                opened={asideBar.show}
                                onClick={asideBar.onToggle}
                                aria-label={asideBar.show ? "Close side bar" : "Open side bar"}
                                size="sm"
                                color={NAV_MUTED}
                                ml={4}
                            />
                        )}
                    </Group>
                </Group>
            </Container>
        </Box>
    )
}

export default AppTopbar
