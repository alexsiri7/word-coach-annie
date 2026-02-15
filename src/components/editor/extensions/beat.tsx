import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import React from "react";

// Component to render the beat in React
const BeatComponent = () => {
    return (
        <NodeViewWrapper className="beat-annotation my-4 mx-2">
            <div className="flex items-start gap-2 p-2 rounded-md border border-dashed border-primary/20 bg-primary/5 text-sm text-muted-foreground">
                <span
                    className="text-primary/40 font-mono text-xs select-none mt-0.5 uppercase tracking-wider"
                    contentEditable={false}
                >
                    Beat
                </span>
                <NodeViewContent className="flex-1 italic font-medium text-foreground/80 outline-none" />
            </div>
        </NodeViewWrapper>
    );
};

export const BeatAnnotation = Node.create({
    name: "beatAnnotation",

    group: "block",

    content: "inline*",

    parseHTML() {
        return [
            {
                tag: 'div[data-type="beat-annotation"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, { "data-type": "beat-annotation" }),
            0,
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(BeatComponent);
    },
});
