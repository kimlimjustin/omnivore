/* eslint-disable react/no-children-prop */
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { VStack } from '../elements/LayoutPrimitives'

import MarkdownIt from 'markdown-it'
import MdEditor, { Plugins } from 'react-markdown-editor-lite'
import 'react-markdown-editor-lite/lib/index.css'
import throttle from 'lodash/throttle'
import { updateHighlightMutation } from '../../lib/networking/mutations/updateHighlightMutation'
import { Highlight } from '../../lib/networking/fragments/highlightFragment'
import SavePlugin from './MDEditorSavePlugin'
import { isDarkTheme } from '../../lib/themeUpdater'
import { MDEditorSettings, RcEditorStyles } from './RcEditorStyles'

const mdParser = new MarkdownIt()

MdEditor.use(Plugins.TabInsert, {
  tabMapValue: 1, // note that 1 means a '\t' instead of ' '.
})

MdEditor.use(Plugins.AutoResize, {
  min: 200,
  max: 800,
})

MdEditor.use(SavePlugin)

type NoteSectionProps = {
  targetId: string

  placeHolder: string

  text: string
  setText: (text: string) => void

  saveText: (text: string) => void
}

export function ArticleNotes(props: NoteSectionProps): JSX.Element {
  const saveText = useCallback(
    (text: string) => {
      props.saveText(text)
    },
    [props]
  )

  return (
    <MarkdownNote
      targetId={props.targetId}
      placeHolder={props.placeHolder}
      text={props.text}
      setText={props.setText}
      saveText={saveText}
      fillBackground={false}
    />
  )
}

type HighlightViewNoteProps = {
  targetId: string

  placeHolder: string
  mode: 'edit' | 'preview'

  highlight: Highlight

  setEditMode: (set: 'edit' | 'preview') => void

  text: string
  setText: (text: string) => void

  updateHighlight: (highlight: Highlight) => void
}

export function HighlightViewNote(props: HighlightViewNoteProps): JSX.Element {
  const [lastSaved, setLastSaved] = useState<Date | undefined>(undefined)

  const saveText = useCallback(
    (text: string) => {
      ;(async () => {
        const success = await updateHighlightMutation({
          annotation: text,
          highlightId: props.highlight?.id,
        })
        if (success) {
          // setLastSaved(updateTime)
          props.highlight.annotation = text
          props.updateHighlight(props.highlight)
        }
      })()
    },
    [props]
  )

  return (
    <MarkdownNote
      targetId={props.targetId}
      placeHolder={props.placeHolder}
      text={props.text}
      setText={props.setText}
      saveText={saveText}
      fillBackground={true}
    />
  )
}

type MarkdownNote = {
  targetId: string

  placeHolder: string

  text: string | undefined
  setText: (text: string) => void
  fillBackground: boolean | undefined

  saveText: (text: string) => void
}

export function MarkdownNote(props: MarkdownNote): JSX.Element {
  const editorRef = useRef<MdEditor | null>(null)
  const isDark = isDarkTheme()

  const saveRef = useRef(props.saveText)

  useEffect(() => {
    saveRef.current = props.saveText
  }, [props])

  const debouncedSave = useMemo<(text: string) => void>(() => {
    const func = (text: string) => {
      saveRef.current?.(text)
    }
    return throttle(func, 3000)
  }, [])

  const handleEditorChange = useCallback(
    (
      data: { text: string; html: string },
      event?: ChangeEvent<HTMLTextAreaElement> | undefined
    ) => {
      props.setText(data.text)
      if (event) {
        event.preventDefault()
      }

      debouncedSave(data.text)
    },
    []
  )

  useEffect(() => {
    const saveMarkdownNote = () => {
      const md = editorRef.current?.getMdValue()
      if (md) {
        props.saveText(md)
      }
    }
    document.addEventListener('saveMarkdownNote', saveMarkdownNote)
    return () => {
      document.removeEventListener('saveMarkdownNote', saveMarkdownNote)
    }
  }, [props, editorRef])

  return (
    <VStack
      css={{
        width: '100%',
        ...RcEditorStyles(isDark, true),
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.code.toLowerCase() === 'escape') {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <MdEditor
        key="note-editor"
        ref={editorRef}
        value={props.text}
        placeholder={props.placeHolder}
        view={MDEditorSettings.view}
        canView={MDEditorSettings.canView}
        plugins={MDEditorSettings.plugins}
        style={{
          width: '100%',
        }}
        renderHTML={(text: string) => mdParser.render(text)}
        onChange={handleEditorChange}
      />
    </VStack>
  )
}
