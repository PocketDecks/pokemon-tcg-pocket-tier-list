import styled from "styled-components";

const LayoutMain = styled.main`
  grid-area: main;
  width: 100%;
  min-width: 0;
  min-height: 100dvh;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;

  &:focus {
    outline: none;
  }
`;

export default LayoutMain;
