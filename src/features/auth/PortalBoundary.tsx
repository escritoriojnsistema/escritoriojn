import type {ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {portalForPath} from '../../app/routes';
import {OperationalFeedback} from '../operation/OperationalFeedback';
import {useAuth} from './AuthProvider';
/** Prevent mounting/fetching the opposite business module, including typed URLs and aliases. */
export function PortalBoundary({children}:{children:ReactNode}){
 const auth=useAuth(),target=portalForPath(useLocation().pathname);
 if(!target)return children;
 if(auth.status==='loading')return null;
 if(auth.status==='denied'||auth.status==='unavailable'||auth.status==='authorized'&&auth.portal!==target)
  return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'} client={auth.portal==='client'}/>;
 return children;
}
