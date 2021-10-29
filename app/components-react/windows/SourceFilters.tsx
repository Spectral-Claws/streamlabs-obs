import { Services } from 'components-react/service-provider';
import React, { useMemo } from 'react';
import Display from 'components-react/shared/Display';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Menu } from 'antd';

export default function SourceFilters() {
  const { WindowsService } = Services;
  const sourceId = useMemo(() => WindowsService.getChildWindowQueryParams().sourceId, []);

  return (
    <ModalLayout fixedChild={<Display sourceId={sourceId} />} bodyStyle={{ padding: 0 }}>
      <Menu theme="dark">
        <Menu.Item>
          Test 1
        </Menu.Item>
        <Menu.Item>
          Test 2
        </Menu.Item>
      </Menu>
    </ModalLayout>
  );
}
