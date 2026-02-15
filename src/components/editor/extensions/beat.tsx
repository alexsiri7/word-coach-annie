import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import React from "react";

// Component to render the beat in React
const BeatComponent = ({ node }: { node: any }) => {
    return (
        <NodeViewWrapper className="beat-annotation my-4 mx-2">
            <div className="flex items-start gap-2 p-2 rounded-md border border-dashed border-primary/20 bg-primary/5 text-sm text-muted-foreground select-none">
                <span className="text-primary/40 font-mono text-xs select-none mt-0.5 uppercase tracking-wider">Beat</span>
                <div className="flex-1 italic font-medium text-foreground/80">{node.attrs.text}</div>
            </div>
        </NodeViewWrapper>
    );
};

export const BeatAnnotation = Node.create({
    name: "beatAnnotation",

    group: "block",

    atom: true,

    addAttributes() {
        return {
            text: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-beat"),
                renderHTML: (attributes) => {
                    return {
                        "data-beat": attributes.text,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "div[data-beat]",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "beat-annotation" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(BeatComponent);
    },
});
