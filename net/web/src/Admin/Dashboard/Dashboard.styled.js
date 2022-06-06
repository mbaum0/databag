import { Button, Space } from 'antd';
import styled from 'styled-components';

export const DashboardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  
  .container {
    background-color: #ffffff;
    display: flex;
    flex-direction: column;
    padding: 16px;
    border-radius: 4px;
    max-width: 500px;
    width: 50%;
  }

  .header {
    color: #444444;
    display: flex;
    flex-direction: row;
    font-size: 20px;
    border-bottom: 1px solid #444444;
  }

  .label {
    padding-right: 8px;
    padding-left: 4px;
    display: flex;
    align-items: center;
  }

  .settings {
    display: flex;
    align-items: center;
  }

  .add {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-grow: 1;
  }
`;

export const AddButton = styled(Button)`
  color: #1890ff;
`;

export const SettingsButton = styled(Button)`
  color: #1890ff;
`;

export const SettingsLayout = styled(Space)`
  width: 100%;

  .host {
    white-space: nowrap;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .storage {
    white-space: nowrap;
    display: flex;
    flex-direction: row;
    align-items: center;
  }
`;