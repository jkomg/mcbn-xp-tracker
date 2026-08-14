import { describe, expect, it, vi } from "vitest"

/**
 * initPDFDocument used to hand back an unusable document instead of failing.
 *
 * Its fontkit and custom-font steps are wrapped in try/catch because both are
 * genuinely optional, but those catches also swallowed the TypeErrors from
 * calling registerFontkit/embedFont on a document that never loaded. The
 * function then returned undefined, and the first visible symptom was
 *
 *   TypeError: Cannot read properties of undefined (reading 'getForm')
 *
 * in whichever caller ran next — a line with no connection to the real cause.
 * That is exactly how the cross-test global.fetch clobbering (fixed by
 * enabling vitest isolation) presented itself, and it cost real time to trace.
 *
 * A load that produces nothing must now fail immediately, naming the template.
 */

vi.mock("@pdf-lib/fontkit", () => ({ default: {} }))

const loadMock = vi.fn()

vi.mock("pdf-lib", async (importOriginal) => {
    const actual = await importOriginal<typeof import("pdf-lib")>()
    return {
        ...actual,
        PDFDocument: {
            ...actual.PDFDocument,
            load: loadMock,
        },
    }
})

// Never reached when the guard fires, but present so a regression fails on the
// assertion below rather than on an unrelated missing-fetch error.
global.fetch = vi.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response)
)

describe("initPDFDocument document guard", () => {
    it("throws a named error when the template fails to load", async () => {
        loadMock.mockResolvedValueOnce(undefined)
        const { createPdf_nerdbert } = await import("~/generator/pdfCreator")
        const { getBasicTestCharacter } = await import("./testUtils")

        await expect(createPdf_nerdbert(getBasicTestCharacter())).rejects.toThrow(
            /did not return a usable document/
        )
    })

    it("throws rather than returning something without getForm", async () => {
        // A truthy but wrong object is the more insidious case: it survives a
        // simple null check and only fails once a caller reaches for a method.
        loadMock.mockResolvedValueOnce({} as never)
        const { createPdf_nerdbert } = await import("~/generator/pdfCreator")
        const { getBasicTestCharacter } = await import("./testUtils")

        await expect(createPdf_nerdbert(getBasicTestCharacter())).rejects.toThrow(
            /did not return a usable document/
        )
    })
})
