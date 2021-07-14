import { useVuex } from 'components-react/hooks';
import React, { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './Highlighter.m.less';
import { IClip } from 'services/highlighter';
import ClipPreview from 'components-react/highlighter/ClipPreview';
import ClipTrimmer from 'components-react/highlighter/ClipTrimmer';
import { ReactSortable } from 'react-sortablejs';
import Form from 'components-react/shared/inputs/Form';
import isEqual from 'lodash/isEqual';
import { SliderInput, FileInput, SwitchInput, TextInput } from 'components-react/shared/inputs';
import { Modal, Button, Alert } from 'antd';
import ExportModal from 'components-react/highlighter/ExportModal';
import PreviewModal from 'components-react/highlighter/PreviewModal';
import BlankSlate from 'components-react/highlighter/BlankSlate';
import { SCRUB_HEIGHT, SCRUB_WIDTH, SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import electron from 'electron';
import path from 'path';
import Scrollable from 'components-react/shared/Scrollable';
import { IHotkey } from 'services/hotkeys';
import { getBindingString } from 'components-react/shared/HotkeyBinding';
import Animate from 'rc-animate';
import TransitionSelector from 'components-react/highlighter/TransitionSelector';

type TModal = 'trim' | 'export' | 'preview' | 'remove' | 'twitch';

export default function Highlighter() {
  const { HighlighterService, HotkeysService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    clips: HighlighterService.views.clips as IClip[],
    exportInfo: HighlighterService.views.exportInfo,
    uploadInfo: HighlighterService.views.uploadInfo,
    loadedCount: HighlighterService.views.loadedCount,
    loaded: HighlighterService.views.loaded,
    transition: HighlighterService.views.transition,
    dismissedTutorial: HighlighterService.views.dismissedTutorial,
    audio: HighlighterService.views.audio,
    error: HighlighterService.views.error,
  }));

  const [showModal, rawSetShowModal] = useState<TModal | null>(null);
  const [modalWidth, setModalWidth] = useState('700px');
  const [hotkey, setHotkey] = useState<IHotkey | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (v.clips.length) {
      HighlighterService.actions.loadClips();
      setShowTutorial(false);
    }
  }, [v.clips.length]);

  useEffect(() => {
    HotkeysService.actions.return.getGeneralHotkeyByName('SAVE_REPLAY').then(hotkey => {
      if (hotkey) setHotkey(hotkey);
    });
  }, []);

  useEffect(() => UsageStatisticsService.actions.recordFeatureUsage('Highlighter'), []);

  // This is kind of weird, but ensures that modals stay the right
  // size while the closing animation is played. This is why modal
  // width has its own state. This makes sure we always set the right
  // size whenever displaying a modal.
  function setShowModal(modal: TModal | null) {
    rawSetShowModal(modal);

    if (modal) {
      setModalWidth(
        {
          trim: '60%',
          preview: '700px',
          export: '700px',
          remove: '400px',
        }[modal],
      );
    }
  }

  function getLoadingView() {
    return (
      <div className={styles.clipLoader}>
        <h2>Loading</h2>
        {v.loadedCount}/{v.clips.length} Clips
      </div>
    );
  }

  function getControls() {
    const transitionTypes = HighlighterService.views.availableTransitions.map(t => {
      return {
        label: t.displayName,
        value: t.type,
      };
    });

    function setTransitionDuration(duration: number) {
      HighlighterService.actions.setTransition({ duration });
    }

    function setMusicEnabled(enabled: boolean) {
      HighlighterService.actions.setAudio({ musicEnabled: enabled });
    }

    const musicExtensions = ['mp3', 'wav', 'flac'];

    function setMusicFile(file: string) {
      HighlighterService.actions.setAudio({ musicPath: file });
    }

    function setMusicVolume(volume: number) {
      HighlighterService.actions.setAudio({ musicVolume: volume });
    }

    return (
      <Scrollable
        style={{
          width: '300px',
          flexShrink: 0,
          background: 'var(--section)',
          borderLeft: '1px solid var(--border)',
          padding: '20px',
        }}
      >
        <Form layout="vertical">
          <TransitionSelector />
          <SliderInput
            label="Transition Duration"
            value={v.transition.duration}
            onChange={setTransitionDuration}
            min={0.5}
            max={5}
            step={0.1}
            debounce={200}
            hasNumberInput={false}
            tooltipPlacement="top"
            tipFormatter={v => `${v}s`}
          />
          <SwitchInput
            label="Background Music"
            value={v.audio.musicEnabled}
            onChange={setMusicEnabled}
          />
          <Animate transitionName="ant-slide-up">
            {v.audio.musicEnabled && (
              <div>
                <FileInput
                  label="Music File"
                  value={v.audio.musicPath}
                  filters={[{ name: 'Audio File', extensions: musicExtensions }]}
                  onChange={setMusicFile}
                />
                <SliderInput
                  label="Music Volume"
                  value={v.audio.musicVolume}
                  onChange={setMusicVolume}
                  min={0}
                  max={100}
                  step={1}
                  debounce={200}
                  hasNumberInput={false}
                  tooltipPlacement="top"
                  tipFormatter={v => `${v}%`}
                />
              </div>
            )}
          </Animate>
        </Form>
        <Button
          style={{ marginTop: '16px', marginRight: '8px' }}
          onClick={() => setShowModal('preview')}
        >
          Preview
        </Button>
        <Button type="primary" style={{ marginTop: '16px' }} onClick={() => setShowModal('export')}>
          Export
        </Button>
      </Scrollable>
    );
  }

  function setClipOrder(clips: { id: string }[]) {
    // ReactDraggable fires setList on mount. To avoid sync IPC,
    // we only fire off a request if the order changed.
    const oldOrder = v.clips.map(c => c.path);
    const newOrder = clips.filter(c => c.id !== 'add').map(c => c.id);

    if (!isEqual(oldOrder, newOrder)) {
      // Intentionally synchronous to avoid visual jank on drop
      HighlighterService.setOrder(newOrder);
    }
  }

  const [inspectedClipPath, setInspectedClipPath] = useState<string | null>(null);
  let inspectedClip: IClip | null;

  if (inspectedClipPath) {
    inspectedClip = v.clips.find(c => c.path === inspectedClipPath) ?? null;
  }

  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.exportInfo.exporting) return;
    if (v.uploadInfo.uploading) return;

    setInspectedClipPath(null);
    setShowModal(null);

    if (v.error) HighlighterService.actions.dismissError();
  }

  function getClipsView() {
    const clipList = [{ id: 'add', filtered: true }, ...v.clips.map(c => ({ id: c.path }))];

    function onDrop(e: React.DragEvent<HTMLDivElement>) {
      const extensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
      const files: string[] = [];
      let fi = e.dataTransfer.files.length;
      while (fi--) {
        const file = e.dataTransfer.files.item(fi)?.path;
        if (file) files.push(file);
      }

      const filtered = files.filter(f => extensions.includes(path.parse(f).ext));

      if (filtered.length) {
        HighlighterService.actions.addClips(filtered);
      }

      e.stopPropagation();
    }

    return (
      <div
        style={{ width: '100%', display: 'flex' }}
        className={styles.clipsViewRoot}
        onDrop={onDrop}
      >
        <Scrollable style={{ flexGrow: 1, padding: '20px 0 20px 20px' }}>
          <div style={{ display: 'flex', paddingRight: 20 }}>
            <div style={{ flexGrow: 1 }}>
              <h1>
                Highlighter{' '}
                <span style={{ fontSize: 12, verticalAlign: 'top', color: 'var(--beta-text)' }}>
                  Beta
                </span>
              </h1>
              <p>{'Drag & drop to reorder clips.'}</p>
            </div>
            <div>
              {hotkey && hotkey.bindings[0] && (
                <b style={{ marginRight: 20 }}>{getBindingString(hotkey.bindings[0])}</b>
              )}
              <Button onClick={() => setShowTutorial(true)}>View Tutorial</Button>
            </div>
          </div>
          <ReactSortable
            list={clipList}
            setList={setClipOrder}
            animation={200}
            filter=".sortable-ignore"
            onMove={e => {
              return e.related.className.indexOf('sortable-ignore') === -1;
            }}
          >
            <div
              key="add"
              style={{ margin: '10px 20px 10px 0', display: 'inline-block' }}
              className="sortable-ignore"
            >
              <AddClip showTwitchImport={() => setShowModal('twitch')} />
            </div>
            {v.clips.map(clip => {
              return (
                <div
                  key={clip.path}
                  style={{ margin: '10px 20px 10px 0', display: 'inline-block' }}
                >
                  <ClipPreview
                    clip={clip}
                    showTrim={() => {
                      setInspectedClipPath(clip.path);
                      setShowModal('trim');
                    }}
                    showRemove={() => {
                      setInspectedClipPath(clip.path);
                      setShowModal('remove');
                    }}
                  />
                </div>
              );
            })}
          </ReactSortable>
        </Scrollable>
        {getControls()}
        <Modal
          getContainer={`.${styles.clipsViewRoot}`}
          onCancel={closeModal}
          footer={null}
          width={modalWidth}
          closable={false}
          visible={!!showModal || !!v.error}
          destroyOnClose={true}
          keyboard={false}
        >
          {!!v.error && <Alert message={v.error} type="error" showIcon />}
          {inspectedClip && showModal === 'trim' && <ClipTrimmer clip={inspectedClip} />}
          {showModal === 'export' && <ExportModal close={closeModal} />}
          {showModal === 'preview' && <PreviewModal close={closeModal} />}
          {showModal === 'twitch' && <TwitchImport />}
          {inspectedClip && showModal === 'remove' && (
            <RemoveClip close={closeModal} clip={inspectedClip} />
          )}
        </Modal>
      </div>
    );
  }

  if ((!v.clips.length && !v.dismissedTutorial && !v.error) || showTutorial) {
    return (
      <BlankSlate
        close={() => {
          setShowTutorial(false);
          HighlighterService.actions.dismissTutorial();
        }}
      />
    );
  }
  if (!v.loaded) return getLoadingView();

  return getClipsView();
}

function AddClip(p: { showTwitchImport: () => void }) {
  const { HighlighterService } = Services;

  async function openClips() {
    const selections = await electron.remote.dialog.showOpenDialog(
      electron.remote.getCurrentWindow(),
      {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Video Files', extensions: SUPPORTED_FILE_TYPES }],
      },
    );

    if (selections && selections.filePaths) {
      HighlighterService.actions.addClips(selections.filePaths);
    }
  }

  return (
    <div
      style={{
        width: `${SCRUB_WIDTH}px`,
        height: `${SCRUB_HEIGHT}px`,
      }}
      className={styles.addClip}
      onClick={openClips}
    >
      <div style={{ fontSize: 24, textAlign: 'center', marginTop: 50 }}>
        <i className="icon-add" style={{ marginRight: 8 }} />
        Add Clip
      </div>
      <p style={{ textAlign: 'center' }}>{'Drag & drop or click to add clips'}</p>
      <a
        style={{ textAlign: 'center', width: '100%', display: 'inline-block' }}
        onClick={e => {
          p.showTwitchImport();
          e.stopPropagation();
        }}
      >
        Or import a Twitch Clip
      </a>
    </div>
  );
}

function RemoveClip(p: { clip: IClip; close: () => void }) {
  const { HighlighterService } = Services;

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>Remove the clip?</h2>
      <p>
        Are you sure you want to remove the clip? You will need to manually import it again to
        reverse this action.
      </p>
      <Button style={{ marginRight: 8 }} onClick={p.close}>
        Canncel
      </Button>
      <Button
        type="primary"
        danger
        onClick={() => {
          HighlighterService.actions.removeClip(p.clip.path);
          p.close();
        }}
      >
        Remove
      </Button>
    </div>
  );
}

function TwitchImport() {
  const [clipUrl, setClipUrl] = useState('');

  return (
    <div>
      <Form>
        <TextInput label="Twitch Clip URL" value={clipUrl} onChange={setClipUrl} />
        <Button type="primary">Import</Button>
      </Form>
    </div>
  );
}
