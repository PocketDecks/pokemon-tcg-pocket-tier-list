import styled from "styled-components";
import { useTranslation } from "react-i18next";
import grassIcon from "../../assets/energy/grass.webp";
import fireIcon from "../../assets/energy/fire.webp";
import waterIcon from "../../assets/energy/water.webp";
import lightningIcon from "../../assets/energy/lightning.webp";
import psychicIcon from "../../assets/energy/psychic.webp";
import fightingIcon from "../../assets/energy/fighting.webp";
import darkIcon from "../../assets/energy/dark.webp";
import steelIcon from "../../assets/energy/steel.webp";

const ENERGIES: Record<number, { name: string; icon: string }> = {
  1: { name: "Grass", icon: grassIcon },
  2: { name: "Fire", icon: fireIcon },
  3: { name: "Water", icon: waterIcon },
  4: { name: "Lightning", icon: lightningIcon },
  5: { name: "Psychic", icon: psychicIcon },
  6: { name: "Fighting", icon: fightingIcon },
  7: { name: "Darkness", icon: darkIcon },
  8: { name: "Metal", icon: steelIcon },
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

const Icon = styled.img`
  width: 2.2rem;
  height: 2.2rem;
  object-fit: contain;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px var(--energy-ring);
`;

const EnergyList = ({ energyIds }: { energyIds: number[] }) => {
  const { t } = useTranslation();
  const energies = [...new Set(energyIds)]
    .map((id) => ENERGIES[id])
    .filter((energy): energy is { name: string; icon: string } => !!energy);

  return (
    <List>
      {energies.map((energy) => (
        <Item key={energy.name}>
          <Icon src={energy.icon} alt="" width={22} height={22} />
          {t(`energyDropdown.${energy.name}`)}
        </Item>
      ))}
    </List>
  );
};

export default EnergyList;
