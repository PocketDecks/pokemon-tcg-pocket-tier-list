import styled from "styled-components";
import ArrowDown from "../assets/arrow-down.svg";

const Dropdown = styled.select`
  min-height: 4.4rem;
  padding: 0.8rem 4rem 0.8rem 1.2rem;
  font-size: 1.6rem;
  border-radius: 0.4rem;
  background: var(--bg);
  color: var(--main);
  border: 1px solid var(--main);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url(${ArrowDown});
  background-repeat: no-repeat;
  background-position: right 1.2rem center;
  background-size: 1.2em 1.2em;

  &:hover {
    border-color: var(--a);
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
`;

export default Dropdown;
