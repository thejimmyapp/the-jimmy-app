# AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

This file is documentation-only design evidence for the Lichess study annotation feature set. It is deliberately limited to the glyph picker, position-bound comments, and position-bound alternate lines.

- Upstream: [`lichess-org/lila`](https://github.com/lichess-org/lila)
- Pinned revision: [`9d0e1761e0841b1018a0b2b19e08fc9b397f5689`](https://github.com/lichess-org/lila/tree/9d0e1761e0841b1018a0b2b19e08fc9b397f5689)
- Upstream license: [GNU Affero General Public License v3](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/LICENSE)

License boundary: these excerpts must remain in `docs/specimens/`. No expression, implementation structure, or excerpt may be copied into `frontend/` or `backend/`. A future learning-moment feature must be implemented independently from the observable behavior and project requirements.

## Glyph button state and symbol

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/study/studyGlyph.ts`, lines 17–29](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/study/studyGlyph.ts#L17-L29)

```ts
const renderGlyph = (ctrl: GlyphForm, node: TreeNode) => (glyph: Glyph) =>
  h(
    'button',
    {
      hook: bind('click', e => {
        ctrl.toggleGlyph(glyph.id);
        blurIfPrimaryClick(e);
      }),
      attrs: { 'data-symbol': glyph.symbol, type: 'button' },
      class: { active: !!node.glyphs && node.glyphs.some(g => g.id === glyph.id) },
    },
    [glyph.name],
  );
```

## Glyph change bound to the current study position

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/study/studyGlyph.ts`, lines 44–47](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/study/studyGlyph.ts#L44-L47)

```ts
  toggleGlyph = throttle(500, (id: GlyphId) => {
    this.root.study!.makeChange('toggleGlyph', this.root.study!.withPosition({ id }));
    this.root.redraw();
  });
```

## Comment identity and position path

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/study/commentForm.ts`, lines 13–35](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/study/commentForm.ts#L13-L35)

```ts
interface Current {
  chapterId: ChapterId;
  path: TreePath;
  node: TreeNode;
}

export class CommentForm {
  current = prop<Current | null>(null);
  opening = prop(false);
  constructor(readonly root: AnalyseCtrl) {}

  submit = (text: string) => this.current() && this.doSubmit(text);

  doSubmit = throttle(500, (text: string) => {
    const cur = this.current();
    if (cur) this.root.study!.makeChange('setComment', { ch: cur.chapterId, path: cur.path, text });
  });

  start = (chapterId: string, path: TreePath, node: TreeNode): void => {
    this.opening(true);
    this.current({ chapterId, path, node });
    this.root.userJump(path);
  };
```

## Comment box input behavior

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/study/commentForm.ts`, lines 77–96](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/study/commentForm.ts#L77-L96)

```ts
  return h(
    'div.study__comments',
    { hook: onInsert(() => root.enableWiki(root.data.game.variant.key === 'standard')) },
    [
      currentComments(root, !study.members.canContribute()),
      h('form.form3', [
        h('textarea#comment-text.form-control', {
          hook: {
            insert(vnode) {
              setupTextarea(vnode);
              const el = vnode.elm as HTMLInputElement;
              el.oninput = () => setTimeout(() => ctrl.submit(el.value), 50);
              const heightStore = storage.make('study.comment.height');
              el.onmouseup = () => heightStore.set(String(el.offsetHeight));
              el.style.height = parseInt(heightStore.get() || '80') + 'px';
              blurOnEscape(el);
            },
            postpatch: (old, vnode) => setupTextarea(vnode, old),
          },
        }),
```

## Comments and sibling variations rendered from one node

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/treeView/inlineView.ts`, lines 51–64](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/treeView/inlineView.ts#L51-L64)

```ts
  renderNodes([child, ...siblings]: TreeNode[], args: Args): LooseVNodes {
    if (!child) return undefined;
    const { isMainline, parentDisclose } = args;
    return child.forceVariation && isMainline
      ? hl('interrupt', this.lines([child, ...siblings], args))
      : [
          this.moveNode(child, args),
          parentDisclose !== 'collapsed' && [
            this.commentNodes(child),
            siblings[0] && hl('interrupt', this.lines(siblings, args)),
          ],
          this.renderNodes(this.ctrl.visibleChildren(child), this.childArgs(child, args, true)),
        ];
  }
```

## A new continuation attached at the selected tree path

### AGPL-3.0 REFERENCE — REIMPLEMENT, NEVER PASTE INTO APP

Source: [`ui/analyse/src/ctrl.ts`, lines 601–626](https://github.com/lichess-org/lila/blob/9d0e1761e0841b1018a0b2b19e08fc9b397f5689/ui/analyse/src/ctrl.ts#L601-L626)

```ts
  private addNodeLocally(move: Move): void {
    const pos = this.node.pos().unwrap().clone();
    move = normalizeMove(pos, move);
    const san = makeSanAndPlay(pos, move);
    const node = completeNode(this.variantKey)({
      ply: this.node.ply + 1,
      uci: makeUci(move),
      san,
      fen: makeFen(pos.toSetup()),
      pos: () => Result.ok(pos),
    });
    addCrazyData(node, pos);
    this.addNode(node, this.path);
  }

  addNode(node: TreeNode, path: TreePath) {
    this.idbTree.onAddNode(node, path);
    const newPath = this.tree.addNode(node, path);
    if (!newPath) {
      console.log("Can't addNode", node, path);
      return this.redraw();
    }

    const relayPath = this.study?.data.chapter.relayPath;
    if (relayPath && relayPath === path) this.forceVariation(newPath, true);
    else this.jump(newPath);
```

## Behavioral reading (not source code)

- Glyph choice is active/inactive state attached to the current study position.
- A comment is keyed by chapter and tree path, and the editor follows the selected path.
- Alternate moves become sibling nodes at a selected tree path; the move view renders those siblings as variations.
- This reference intentionally omits collaboration, permissions, server transport, chapter management, engine analysis, and unrelated study modules.
