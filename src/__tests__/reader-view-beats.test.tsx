// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReaderView } from "@/app/read/[id]/reader-view";
import { ToastProvider } from "@/components/ui/toast";

const sceneHtml =
  "<p>Visible prose here.</p>" +
  '<div data-type="beat-annotation" data-beat="secret div plan">secret div plan</div>' +
  "<!-- beat: secret comment\nplan > spans lines -->" +
  "<p>More prose.</p>";

function renderReader() {
  return renderToStaticMarkup(
    <ToastProvider>
      <ReaderView
        project={{ id: "p1", title: "Book", author: "A", genre: "", synopsis: "" }}
        outline={[
          { id: "s1", type: "SCENE", title: "Scene", orderIndex: 0, parentId: null, children: [], content: sceneHtml },
        ]}
        isOwner={false}
      />
    </ToastProvider>
  );
}

describe("ReaderView beat stripping", () => {
  it("renders the scene prose without either beat form", () => {
    const html = renderReader();
    expect(html).toContain("Visible prose here.");
    expect(html).toContain("More prose.");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("beat-annotation");
  });

  it("counts only the prose words", () => {
    expect(renderReader()).toMatch(/>5 words</i);
  });
});
