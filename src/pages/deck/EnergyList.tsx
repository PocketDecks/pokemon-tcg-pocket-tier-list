import styled from "styled-components";
import { useTranslation } from "react-i18next";

const ENERGIES: Record<number, { name: string; colour: string }> = {
  1: { name: "Grass", colour: "#5cb85c" },
  2: { name: "Fire", colour: "#e5603b" },
  3: { name: "Water", colour: "#3f9ae0" },
  4: { name: "Lightning", colour: "#f2c232" },
  5: { name: "Psychic", colour: "#a865c9" },
  6: { name: "Fighting", colour: "#c4703a" },
  7: { name: "Darkness", colour: "#3c6170" },
  8: { name: "Metal", colour: "#9aa5ae" },
};

const List = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.4rem;
  list-style: none;
  font-size: 1.8rem;
  font-weight: 600;
`;

const Item = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const Marker = styled.span<{ $colour: string }>`
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: ${(props) => props.$colour};
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
`;

const EnergyList = ({ energyIds }: { energyIds: number[] }) => {
  const { t } = useTranslation();
  const energies = [...new Set(energyIds)]
    .map((id) => ENERGIES[id])
    .filter((energy): energy is { name: string; colour: string } => !!energy);

  return (
    <List>
      {energies.map((energy) => (
        <Item key={energy.name}>
          <Marker $colour={energy.colour} aria-hidden="true" />
          {t(`energyDropdown.${energy.name}`)}
        </Item>
      ))}
    </List>
  );
};

export default EnergyList;
